import { createHash } from 'node:crypto';
import { auth } from '@/lib/auth/server';
import { withTransaction } from '@/lib/db/transaction';

export const dynamic = 'force-dynamic';
const FX_API = 'https://api.frankfurter.dev/v2';
const FEE_BPS = 0;

function errorResponse(message: string, status: number) { return Response.json({ error: message }, { status }); }
function parseMinor(value: string) { const normalized = value.trim(); if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Invalid amount'); const [whole, fraction = ''] = normalized.split('.'); return Number(whole) * 100 + Number((fraction + '00').slice(0, 2)); }
function hashRequest(paymentRequestId: string, payerWalletId: string) { return createHash('sha256').update(JSON.stringify({ paymentRequestId, payerWalletId })).digest('hex'); }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return errorResponse('Authentication required', 401);
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) return errorResponse('A valid Idempotency-Key is required', 400);
  const { id } = await params;
  let body: { payerWalletId?: unknown };
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400); }
  const payerWalletId = typeof body.payerWalletId === 'string' ? body.payerWalletId.trim() : '';
  if (!payerWalletId) return errorResponse('payerWalletId is required', 400);
  const requestHash = hashRequest(id, payerWalletId);

  try {
    const result = await withTransaction(async (client) => {
      const idem = await client.query(`INSERT INTO flowcash.idempotency_keys (user_id,idempotency_key,request_hash,status) VALUES ($1,$2,$3,'processing') ON CONFLICT (user_id,idempotency_key) DO NOTHING RETURNING id`, [user.id, idempotencyKey, requestHash]);
      if (!idem.rowCount) {
        const existing = await client.query(`SELECT request_hash,status,response FROM flowcash.idempotency_keys WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE`, [user.id, idempotencyKey]);
        const row = existing.rows[0];
        if (!row || row.request_hash !== requestHash) throw Object.assign(new Error('Idempotency conflict'), { code: 'IDEMPOTENCY_CONFLICT' });
        if (row.status === 'completed' && row.response) return { replay: true, response: row.response };
        throw Object.assign(new Error('Request already processing'), { code: 'IDEMPOTENCY_PROCESSING' });
      }

      const prResult = await client.query(`SELECT id,requester_user_id,payer_user_id,requester_wallet_id,amount::text,currency,description,status,expires_at FROM flowcash.payment_requests WHERE id=$1 AND payer_user_id=$2 FOR UPDATE`, [id, user.id]);
      const pr = prResult.rows[0];
      if (!pr) throw Object.assign(new Error('Payment request not found'), { code: 'NOT_FOUND' });
      if (pr.status !== 'pending') throw Object.assign(new Error('Payment request is not pending'), { code: 'NOT_PENDING' });
      if (pr.expires_at && new Date(pr.expires_at).getTime() <= Date.now()) {
        await client.query(`UPDATE flowcash.payment_requests SET status='expired',updated_at=now() WHERE id=$1`, [id]);
        throw Object.assign(new Error('Payment request expired'), { code: 'EXPIRED' });
      }

      const payerWalletResult = await client.query(`SELECT id,user_id,currency,balance,status FROM flowcash.wallets WHERE id=$1 AND user_id=$2`, [payerWalletId, user.id]);
      const payerWallet = payerWalletResult.rows[0];
      if (!payerWallet) throw Object.assign(new Error('Payer wallet not found'), { code: 'WALLET_NOT_FOUND' });
      if (payerWallet.status !== 'active') throw Object.assign(new Error('Payer wallet inactive'), { code: 'WALLET_INACTIVE' });

      const locked = await client.query(`SELECT id,balance,status,currency FROM flowcash.wallets WHERE id IN ($1,$2) ORDER BY id FOR UPDATE`, [payerWallet.id, pr.requester_wallet_id]);
      const byId = new Map(locked.rows.map((r) => [String(r.id), r]));
      const payer = byId.get(String(payerWallet.id));
      const requester = byId.get(String(pr.requester_wallet_id));
      if (!payer || !requester) throw new Error('Wallet lock failed');
      if (requester.status !== 'active') throw Object.assign(new Error('Requester wallet inactive'), { code: 'RECIPIENT_INACTIVE' });

      let rate = 1; let rateDate: string | null = null; let source = 'identity';
      if (payer.currency !== pr.currency) {
        const upstream = await fetch(`${FX_API}/rate/${encodeURIComponent(payer.currency)}/${encodeURIComponent(pr.currency)}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!upstream.ok) throw Object.assign(new Error('FX rate unavailable'), { code: 'FX_UNAVAILABLE' });
        const quote = await upstream.json() as { rate?: number; date?: string };
        if (!quote.rate || !Number.isFinite(quote.rate) || quote.rate <= 0) throw Object.assign(new Error('Invalid FX rate'), { code: 'FX_UNAVAILABLE' });
        rate = quote.rate; rateDate = quote.date ?? null; source = 'frankfurter';
      }

      const requestedMinor = parseMinor(pr.amount);
      const feeMinorTarget = Math.ceil(requestedMinor * FEE_BPS / 10000);
      const targetMinor = requestedMinor + feeMinorTarget;
      const sourceMinor = payer.currency === pr.currency ? targetMinor : Math.ceil((targetMinor / 100) / rate * 100);
      if (!Number.isSafeInteger(sourceMinor) || sourceMinor <= 0) throw new Error('Settlement amount out of range');
      const sourceAmount = sourceMinor / 100;
      const targetAmount = requestedMinor / 100;
      if (Number(payer.balance) < sourceAmount) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });

      const quoteRows = await client.query(`INSERT INTO flowcash.fx_quotes (from_currency,to_currency,source_amount,rate,target_amount,source,rate_date,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes') RETURNING id,rate::text,expires_at::text`, [payer.currency, pr.currency, sourceAmount.toFixed(2), rate.toString(), (targetMinor / 100).toFixed(2), source, rateDate]);
      const quoteRow = quoteRows.rows[0];
      const settlementId = crypto.randomUUID();
      const metadata = { paymentRequestId: id, settlementId, fxQuoteId: quoteRow.id, fxRate: rate, fxRateDate: rateDate, fxSource: source, feeBps: FEE_BPS, feeTargetAmount: (feeMinorTarget / 100).toFixed(2), version: 2 };
      const payerRef = `FC-PAY-${settlementId.slice(0, 12).toUpperCase()}`;
      const requesterRef = `FC-REQ-${settlementId.slice(0, 12).toUpperCase()}`;

      const payerTx = await client.query(`INSERT INTO flowcash.transactions (wallet_id,type,amount,currency,status,reference,description,metadata) VALUES ($1,'payment',$2,$3,'completed',$4,$5,$6::jsonb) RETURNING id,type,amount::text,currency,status,reference,description,created_at::text`, [payer.id, sourceAmount.toFixed(2), payer.currency, payerRef, pr.description || 'Paiement FlowCash', JSON.stringify({ ...metadata, direction: 'outgoing' })]);
      const requesterTx = await client.query(`INSERT INTO flowcash.transactions (wallet_id,type,amount,currency,status,reference,description,metadata) VALUES ($1,'payment',$2,$3,'completed',$4,$5,$6::jsonb) RETURNING id,type,amount::text,currency,status,reference,description,created_at::text`, [requester.id, targetAmount.toFixed(2), pr.currency, requesterRef, pr.description || 'Demande de paiement reçue', JSON.stringify({ ...metadata, direction: 'incoming' })]);

      const accounts = await client.query(`SELECT id,wallet_id,code FROM flowcash.ledger_accounts WHERE wallet_id IN ($1,$2) AND code IN ('CASH','AVAILABLE') FOR UPDATE`, [payer.id, requester.id]);
      const map = new Map(accounts.rows.map((r) => [`${r.wallet_id}:${r.code}`, r.id]));
      const payerAvailable = map.get(`${payer.id}:AVAILABLE`); const payerCash = map.get(`${payer.id}:CASH`); const requesterCash = map.get(`${requester.id}:CASH`); const requesterAvailable = map.get(`${requester.id}:AVAILABLE`);
      if (!payerAvailable || !payerCash || !requesterCash || !requesterAvailable) throw new Error('Wallet ledger accounts are not provisioned');

      await client.query(`INSERT INTO flowcash.ledger_entries (transaction_id,account_id,wallet_id,direction,amount,currency) VALUES ($1,$2,$3,'debit',$5,$4),($1,$6,$3,'credit',$5,$4)`, [payerTx.rows[0].id, payerAvailable, payer.id, payer.currency, sourceAmount, payerCash]);
      await client.query(`INSERT INTO flowcash.ledger_entries (transaction_id,account_id,wallet_id,direction,amount,currency) VALUES ($1,$2,$3,'debit',$5,$4),($1,$6,$3,'credit',$5,$4)`, [requesterTx.rows[0].id, requesterCash, requester.id, pr.currency, targetAmount, requesterAvailable]);

      const payerUpdate = await client.query(`UPDATE flowcash.wallets SET balance=balance-$1,updated_at=now() WHERE id=$2 AND balance >= $1 RETURNING balance::text`, [sourceAmount, payer.id]);
      if (!payerUpdate.rows[0]) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });
      const requesterUpdate = await client.query(`UPDATE flowcash.wallets SET balance=balance+$1,updated_at=now() WHERE id=$2 RETURNING balance::text`, [targetAmount, requester.id]);
      if (!requesterUpdate.rows[0]) throw new Error('Requester balance update failed');
      await client.query(`UPDATE flowcash.payment_requests SET status='accepted',payer_wallet_id=$1,accepted_at=now(),updated_at=now() WHERE id=$2`, [payer.id, id]);

      await client.query(`INSERT INTO flowcash.notifications (user_id,type,title,body,entity_type,entity_id) VALUES ($1,'payment_request.accepted','Paiement effectué',format('Vous avez payé %s %s.', $2, $3),'payment_request',$4),($5,'payment_request.accepted','Paiement reçu',format('Votre demande de paiement de %s %s a été acceptée.',$2,$3),'payment_request',$4)`, [user.id, targetAmount.toFixed(2), pr.currency, id, pr.requester_user_id]);
      await client.query(`INSERT INTO flowcash.audit_events (actor_user_id,event_type,entity_type,entity_id,metadata) VALUES ($1,'payment_request.accepted','payment_request',$2,$3::jsonb)`, [user.id, id, JSON.stringify({ settlementId, payerWalletId: payer.id, requesterWalletId: requester.id, payerTransactionId: payerTx.rows[0].id, requesterTransactionId: requesterTx.rows[0].id, sourceAmount, targetAmount, currency: pr.currency })]);

      const response = { settlementId, paymentRequestId: id, quote: { id: quoteRow.id, from: payer.currency, to: pr.currency, sourceAmount: sourceAmount.toFixed(2), targetAmount: targetAmount.toFixed(2), rate, source, rateDate, expiresAt: quoteRow.expires_at }, transaction: payerTx.rows[0], recipientTransaction: requesterTx.rows[0] };
      await client.query(`UPDATE flowcash.idempotency_keys SET status='completed',transaction_id=$1,response=$2::jsonb,updated_at=now() WHERE user_id=$3 AND idempotency_key=$4`, [payerTx.rows[0].id, JSON.stringify(response), user.id, idempotencyKey]);
      return { replay: false, response };
    });
    return Response.json(result.response, { status: result.replay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : '';
    if (code === 'IDEMPOTENCY_CONFLICT') return errorResponse('Idempotency key conflict', 409);
    if (code === 'IDEMPOTENCY_PROCESSING') return errorResponse('Request already processing', 409);
    if (code === 'NOT_FOUND') return errorResponse('Payment request not found', 404);
    if (code === 'NOT_PENDING') return errorResponse('Payment request is no longer pending', 409);
    if (code === 'EXPIRED') return errorResponse('Payment request expired', 410);
    if (code === 'WALLET_NOT_FOUND') return errorResponse('Payer wallet not found', 404);
    if (code === 'WALLET_INACTIVE' || code === 'RECIPIENT_INACTIVE') return errorResponse('Wallet inactive', 403);
    if (code === 'INSUFFICIENT_BALANCE') return errorResponse('Insufficient balance', 422);
    if (code === 'FX_UNAVAILABLE') return errorResponse('FX rate temporarily unavailable', 503);
    console.error('FlowCash payment request acceptance failed', error);
    return errorResponse('Unable to complete payment', 500);
  }
}
