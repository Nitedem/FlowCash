import { auth } from '@/lib/auth/server';
import { withTransaction } from '@/lib/db/transaction';

export const dynamic = 'force-dynamic';
const MAX_TEST_DEPOSIT = 10_000_000;
function jsonError(message: string, status: number) { return Response.json({ error: message }, { status }); }

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return jsonError('Authentication required', 401);
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 100) return jsonError('A valid Idempotency-Key is required', 400);
  let body: { type?: string; amount?: number; description?: string };
  try { body = await request.json(); } catch { return jsonError('Invalid JSON body', 400); }
  const type = body.type;
  const amount = Number(body.amount);
  const description = body.description?.trim() || null;
  if (type !== 'deposit' && type !== 'withdrawal') return jsonError('Unsupported operation', 400);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return jsonError('Amount must be a positive whole number of XAF', 400);
  if (type === 'deposit') {
    if (process.env.FLOWCASH_TEST_MODE !== 'true') return jsonError('Test deposits are disabled', 403);
    if (amount > MAX_TEST_DEPOSIT) return jsonError('Test deposit limit exceeded', 400);
  }
  const requestHash = `${type}:${amount}:${description || ''}`;

  try {
    const result = await withTransaction(async (client) => {
      const inserted = await client.query(`INSERT INTO flowcash.idempotency_keys (user_id, idempotency_key, request_hash, status) VALUES ($1, $2, $3, 'processing') ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id`, [user.id, idempotencyKey, requestHash]);
      if (inserted.rowCount === 0) {
        const existing = await client.query(`SELECT request_hash, status, response FROM flowcash.idempotency_keys WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE`, [user.id, idempotencyKey]);
        const row = existing.rows[0];
        if (!row) throw new Error('Idempotency record disappeared');
        if (row.request_hash !== requestHash) throw Object.assign(new Error('Idempotency key conflict'), { code: 'IDEMPOTENCY_CONFLICT' });
        if (row.status === 'completed' && row.response) return { replay: true, response: row.response };
        throw Object.assign(new Error('Request already processing'), { code: 'IDEMPOTENCY_PROCESSING' });
      }
      const walletResult = await client.query(`SELECT id, public_code, balance, currency, status FROM flowcash.wallets WHERE user_id = $1 AND currency = 'XAF' FOR UPDATE`, [user.id]);
      const wallet = walletResult.rows[0];
      if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'WALLET_NOT_FOUND' });
      if (wallet.status !== 'active') throw Object.assign(new Error('Wallet is not active'), { code: 'WALLET_INACTIVE' });
      if (type === 'withdrawal' && Number(wallet.balance) < amount) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });
      const movementCode = `FCX-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
      const transaction = await client.query(`INSERT INTO flowcash.transactions (wallet_id, type, amount, currency, status, reference, movement_code, description, metadata) VALUES ($1, $2, $3, 'XAF', 'completed', $4, $5, $6, $7::jsonb) RETURNING id, type, amount::text, currency, status, reference, movement_code, description, created_at::text`, [wallet.id, type, amount, movementCode, movementCode, description, JSON.stringify({ source: type === 'deposit' ? 'test' : 'internal', version: 3, movementCode })]);
      const accounts = await client.query(`SELECT id, code FROM flowcash.ledger_accounts WHERE wallet_id = $1 AND code IN ('CASH', 'AVAILABLE') ORDER BY code`, [wallet.id]);
      const accountByCode = new Map(accounts.rows.map((row) => [row.code, row.id]));
      const cashAccount = accountByCode.get('CASH'); const availableAccount = accountByCode.get('AVAILABLE');
      if (!cashAccount || !availableAccount) throw new Error('Wallet ledger accounts are not provisioned');
      const entries = type === 'deposit' ? [[cashAccount, 'debit'], [availableAccount, 'credit']] : [[availableAccount, 'debit'], [cashAccount, 'credit']];
      for (const [accountId, direction] of entries) await client.query(`INSERT INTO flowcash.ledger_entries (transaction_id, account_id, wallet_id, direction, amount, currency) VALUES ($1, $2, $3, $4, $5, 'XAF')`, [transaction.rows[0].id, accountId, wallet.id, direction, amount]);
      const updatedWallet = await client.query(`UPDATE flowcash.wallets SET balance = balance ${type === 'deposit' ? '+' : '-'} $1, updated_at = now() WHERE id = $2 ${type === 'withdrawal' ? 'AND balance >= $1' : ''} RETURNING balance::text, currency, public_code`, [amount, wallet.id]);
      if (!updatedWallet.rows[0]) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });
      await client.query(`INSERT INTO flowcash.notifications (user_id,type,title,body,entity_type,entity_id) VALUES ($1,$2,$3,$4,'transaction',$5)`, [user.id, type === 'deposit' ? 'wallet.deposit' : 'wallet.withdrawal', type === 'deposit' ? 'Dépôt effectué' : 'Retrait enregistré', type === 'deposit' ? `Votre dépôt test de ${amount} XAF a été effectué.` : `Votre retrait interne de ${amount} XAF a été enregistré.`, transaction.rows[0].id]);
      await client.query(`INSERT INTO flowcash.audit_events (actor_user_id,event_type,entity_type,entity_id,metadata) VALUES ($1,$2,'transaction',$3,$4::jsonb)`, [user.id, type === 'deposit' ? 'wallet.deposit.completed' : 'wallet.withdrawal.completed', transaction.rows[0].id, JSON.stringify({ movementCode, walletId: wallet.id, amount, currency: 'XAF', source: type === 'deposit' ? 'test' : 'internal' })]);
      const response = { movementCode, transaction: transaction.rows[0], wallet: updatedWallet.rows[0] };
      await client.query(`UPDATE flowcash.idempotency_keys SET status = 'completed', transaction_id = $1, response = $2::jsonb, updated_at = now() WHERE user_id = $3 AND idempotency_key = $4`, [transaction.rows[0].id, JSON.stringify(response), user.id, idempotencyKey]);
      return { replay: false, response };
    });
    return Response.json(result.response, { status: result.replay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : '';
    if (code === 'IDEMPOTENCY_CONFLICT') return jsonError('Idempotency key conflict', 409);
    if (code === 'IDEMPOTENCY_PROCESSING') return jsonError('Request already processing', 409);
    if (code === 'WALLET_NOT_FOUND') return jsonError('Wallet not found', 404);
    if (code === 'WALLET_INACTIVE') return jsonError('Wallet is not active', 403);
    if (code === 'INSUFFICIENT_BALANCE') return jsonError('Insufficient balance', 422);
    console.error('FlowCash wallet operation failed', error);
    return jsonError('Unable to complete wallet operation', 500);
  }
}
