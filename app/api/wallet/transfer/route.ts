import { createHash } from 'node:crypto';
import { auth } from '@/lib/auth/server';
import { withTransaction } from '@/lib/db/transaction';

export const dynamic = 'force-dynamic';
const MAX_TRANSFER_XAF = 100_000_000;
const MAX_DESCRIPTION_LENGTH = 500;
function jsonError(message: string, status: number) { return Response.json({ error: message }, { status }); }
function hashRequest(payload: { recipientWalletCode: string; amount: number; description: string | null }) { return createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return jsonError('Authentication required', 401);
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) return jsonError('A valid Idempotency-Key is required', 400);
  let body: { recipientWalletCode?: unknown; amount?: unknown; description?: unknown };
  try { body = await request.json(); } catch { return jsonError('Invalid JSON body', 400); }
  const recipientWalletCode = typeof body.recipientWalletCode === 'string' ? body.recipientWalletCode.trim().toUpperCase() : '';
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) || null : null;
  if (!/^FCW-[A-Z0-9]{12}$/.test(recipientWalletCode)) return jsonError('A valid FlowCash wallet code is required', 400);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_TRANSFER_XAF) return jsonError('Amount must be a positive whole number of XAF within the transfer limit', 400);
  const requestHash = hashRequest({ recipientWalletCode, amount, description });

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
      const senderResult = await client.query(`SELECT id, user_id, status FROM flowcash.wallets WHERE user_id = $1 AND currency = 'XAF' LIMIT 1`, [user.id]);
      const sender = senderResult.rows[0];
      if (!sender) throw Object.assign(new Error('Sender wallet not found'), { code: 'WALLET_NOT_FOUND' });
      if (sender.status !== 'active') throw Object.assign(new Error('Sender wallet is not active'), { code: 'WALLET_INACTIVE' });
      const recipientResult = await client.query(`SELECT p.id, p.full_name, w.id AS wallet_id, w.public_code, w.currency, w.status FROM flowcash.wallets w JOIN flowcash.profiles p ON p.id = w.user_id WHERE w.public_code = $1 AND w.currency = 'XAF' LIMIT 1`, [recipientWalletCode]);
      const recipient = recipientResult.rows[0];
      if (!recipient) throw Object.assign(new Error('Recipient wallet not found'), { code: 'RECIPIENT_NOT_FOUND' });
      if (recipient.id === user.id) throw Object.assign(new Error('Self transfer is not allowed'), { code: 'SELF_TRANSFER' });
      if (recipient.status !== 'active') throw Object.assign(new Error('Recipient wallet is not active'), { code: 'RECIPIENT_INACTIVE' });
      const senderId = String(sender.id); const recipientId = String(recipient.wallet_id);
      const lockedWallets = await client.query(`SELECT id, balance, status FROM flowcash.wallets WHERE id IN ($1, $2) ORDER BY id FOR UPDATE`, [senderId, recipientId]);
      const lockedById = new Map(lockedWallets.rows.map((row) => [String(row.id), row]));
      const lockedSender = lockedById.get(senderId); const lockedRecipient = lockedById.get(recipientId);
      if (!lockedSender || !lockedRecipient) throw new Error('Wallet lock failed');
      if (lockedSender.status !== 'active') throw Object.assign(new Error('Sender wallet is not active'), { code: 'WALLET_INACTIVE' });
      if (lockedRecipient.status !== 'active') throw Object.assign(new Error('Recipient wallet is not active'), { code: 'RECIPIENT_INACTIVE' });
      if (Number(lockedSender.balance) < amount) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });
      const movementCode = `FCX-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
      const metadataBase = { movementCode, source: 'internal', version: 3, recipientWalletCode };
      const senderTransaction = await client.query(`INSERT INTO flowcash.transactions (wallet_id, type, amount, currency, status, reference, movement_code, description, metadata) VALUES ($1, 'transfer', $2, 'XAF', 'completed', $3, $4, $5, $6::jsonb) RETURNING id, type, amount::text, currency, status, reference, movement_code, description, created_at::text`, [senderId, amount, movementCode, movementCode, description || `Transfert vers ${recipientWalletCode}`, JSON.stringify({ ...metadataBase, direction: 'outgoing' })]);
      const recipientTransaction = await client.query(`INSERT INTO flowcash.transactions (wallet_id, type, amount, currency, status, reference, movement_code, description, metadata) VALUES ($1, 'transfer', $2, 'XAF', 'completed', $3, $4, $5, $6::jsonb) RETURNING id, type, amount::text, currency, status, reference, movement_code, description, created_at::text`, [recipientId, amount, movementCode, movementCode, description || 'Transfert reçu', JSON.stringify({ ...metadataBase, direction: 'incoming', senderId: user.id })]);
      const accounts = await client.query(`SELECT id, wallet_id, code FROM flowcash.ledger_accounts WHERE wallet_id IN ($1, $2) AND code IN ('CASH', 'AVAILABLE') ORDER BY wallet_id, code FOR UPDATE`, [senderId, recipientId]);
      const accountMap = new Map(accounts.rows.map((row) => [`${row.wallet_id}:${row.code}`, row.id]));
      const senderAvailable = accountMap.get(`${senderId}:AVAILABLE`); const senderCash = accountMap.get(`${senderId}:CASH`); const recipientAvailable = accountMap.get(`${recipientId}:AVAILABLE`); const recipientCash = accountMap.get(`${recipientId}:CASH`);
      if (!senderAvailable || !senderCash || !recipientAvailable || !recipientCash) throw new Error('Wallet ledger accounts are not provisioned');
      await client.query(`INSERT INTO flowcash.ledger_entries (transaction_id, account_id, wallet_id, direction, amount, currency) VALUES ($1, $2, $3, 'debit', $5, 'XAF'), ($1, $4, $3, 'credit', $5, 'XAF')`, [senderTransaction.rows[0].id, senderAvailable, senderId, senderCash, amount]);
      await client.query(`INSERT INTO flowcash.ledger_entries (transaction_id, account_id, wallet_id, direction, amount, currency) VALUES ($1, $2, $3, 'debit', $5, 'XAF'), ($1, $4, $3, 'credit', $5, 'XAF')`, [recipientTransaction.rows[0].id, recipientCash, recipientId, 'XAF', amount]);
      const senderUpdate = await client.query(`UPDATE flowcash.wallets SET balance = balance - $1, updated_at = now() WHERE id = $2 AND balance >= $1 RETURNING balance::text, currency`, [amount, senderId]);
      if (!senderUpdate.rows[0]) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });
      const recipientUpdate = await client.query(`UPDATE flowcash.wallets SET balance = balance + $1, updated_at = now() WHERE id = $2 RETURNING balance::text, currency`, [amount, recipientId]);
      if (!recipientUpdate.rows[0]) throw new Error('Recipient balance update failed');
      await client.query(`INSERT INTO flowcash.notifications (user_id,type,title,body,entity_type,entity_id) VALUES ($1,'transfer.sent','Transfert envoyé',format('Vous avez envoyé %s XAF à %s.', $2, $3),'transaction',$4),($5,'transfer.received','Transfert reçu',format('Vous avez reçu %s XAF de %s.', $2, $6),'transaction',$4)`, [user.id, amount.toFixed(0), recipient.full_name || recipient.public_code, senderTransaction.rows[0].id, recipient.id, user.name || 'un utilisateur FlowCash']);
      await client.query(`INSERT INTO flowcash.audit_events (actor_user_id,event_type,entity_type,entity_id,metadata) VALUES ($1,'transfer.completed','transaction',$2,$3::jsonb)`, [user.id, senderTransaction.rows[0].id, JSON.stringify({ movementCode, senderWalletId: senderId, recipientWalletId: recipientId, senderTransactionId: senderTransaction.rows[0].id, recipientTransactionId: recipientTransaction.rows[0].id, amount, currency: 'XAF' })]);
      const response = { movementCode, transaction: senderTransaction.rows[0], recipientTransaction: recipientTransaction.rows[0], recipient: { name: recipient.full_name, walletCode: recipient.public_code, currency: recipient.currency }, wallet: senderUpdate.rows[0] };
      await client.query(`UPDATE flowcash.idempotency_keys SET status = 'completed', transaction_id = $1, response = $2::jsonb, updated_at = now() WHERE user_id = $3 AND idempotency_key = $4`, [senderTransaction.rows[0].id, JSON.stringify(response), user.id, idempotencyKey]);
      return { replay: false, response };
    });
    return Response.json(result.response, { status: result.replay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : '';
    if (code === 'IDEMPOTENCY_CONFLICT') return jsonError('Idempotency key conflict', 409);
    if (code === 'IDEMPOTENCY_PROCESSING') return jsonError('Request already processing', 409);
    if (code === 'RECIPIENT_NOT_FOUND') return jsonError('Portefeuille bénéficiaire introuvable', 404);
    if (code === 'SELF_TRANSFER') return jsonError('Vous ne pouvez pas transférer vers votre propre portefeuille', 400);
    if (code === 'RECIPIENT_INACTIVE') return jsonError('Le portefeuille bénéficiaire n’est pas actif', 403);
    if (code === 'WALLET_NOT_FOUND') return jsonError('Portefeuille introuvable', 404);
    if (code === 'WALLET_INACTIVE') return jsonError('Le portefeuille n’est pas actif', 403);
    if (code === 'INSUFFICIENT_BALANCE') return jsonError('Solde insuffisant', 422);
    console.error('FlowCash internal transfer failed', error);
    return jsonError('Impossible de terminer le transfert', 500);
  }
}
