import { createHash } from 'node:crypto';
import { auth } from '@/lib/auth/server';
import { withTransaction } from '@/lib/db/transaction';

export const dynamic = 'force-dynamic';

const MAX_TRANSFER_XAF = 100_000_000;
const MAX_DESCRIPTION_LENGTH = 500;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function hashRequest(payload: { recipientEmail: string; amount: number; description: string | null }) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  const user = session?.user;

  if (!user) return jsonError('Authentication required', 401);

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
    return jsonError('A valid Idempotency-Key is required', 400);
  }

  let body: { recipientEmail?: unknown; amount?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim().toLowerCase() : '';
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
  const description = typeof body.description === 'string'
    ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) || null
    : null;

  if (!recipientEmail || recipientEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return jsonError('A valid recipient email is required', 400);
  }

  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_TRANSFER_XAF) {
    return jsonError('Amount must be a positive whole number of XAF within the transfer limit', 400);
  }

  const requestHash = hashRequest({ recipientEmail, amount, description });

  try {
    const result = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO flowcash.idempotency_keys
          (user_id, idempotency_key, request_hash, status)
         VALUES ($1, $2, $3, 'processing')
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [user.id, idempotencyKey, requestHash],
      );

      if (inserted.rowCount === 0) {
        const existing = await client.query(
          `SELECT request_hash, status, response
           FROM flowcash.idempotency_keys
           WHERE user_id = $1 AND idempotency_key = $2
           FOR UPDATE`,
          [user.id, idempotencyKey],
        );

        const row = existing.rows[0];
        if (!row) throw new Error('Idempotency record disappeared');
        if (row.request_hash !== requestHash) {
          throw Object.assign(new Error('Idempotency key was reused for a different request'), { code: 'IDEMPOTENCY_CONFLICT' });
        }
        if (row.status === 'completed' && row.response) {
          return { replay: true, response: row.response };
        }
        throw Object.assign(new Error('A request with this idempotency key is already processing'), { code: 'IDEMPOTENCY_PROCESSING' });
      }

      const senderResult = await client.query(
        `SELECT id, status
         FROM flowcash.wallets
         WHERE user_id = $1 AND currency = 'XAF'
         LIMIT 1`,
        [user.id],
      );
      const sender = senderResult.rows[0];
      if (!sender) throw Object.assign(new Error('Sender wallet not found'), { code: 'WALLET_NOT_FOUND' });
      if (sender.status !== 'active') throw Object.assign(new Error('Sender wallet is not active'), { code: 'WALLET_INACTIVE' });

      const recipientResult = await client.query(
        `SELECT p.id, p.email, w.id AS wallet_id
         FROM flowcash.profiles p
         JOIN flowcash.wallets w ON w.user_id = p.id AND w.currency = 'XAF'
         WHERE LOWER(p.email) = $1
         LIMIT 1`,
        [recipientEmail],
      );
      const recipient = recipientResult.rows[0];
      if (!recipient) throw Object.assign(new Error('Recipient not found'), { code: 'RECIPIENT_NOT_FOUND' });
      if (recipient.id === user.id) throw Object.assign(new Error('Self transfer is not allowed'), { code: 'SELF_TRANSFER' });

      const senderId = String(sender.id);
      const recipientId = String(recipient.wallet_id);

      const lockedWallets = await client.query(
        `SELECT id, balance, status
         FROM flowcash.wallets
         WHERE id IN ($1, $2)
         ORDER BY id
         FOR UPDATE`,
        [senderId, recipientId],
      );
      const lockedById = new Map(lockedWallets.rows.map((row) => [String(row.id), row]));
      const lockedSender = lockedById.get(senderId);
      const lockedRecipient = lockedById.get(recipientId);

      if (!lockedSender || !lockedRecipient) throw new Error('Wallet lock failed');
      if (lockedSender.status !== 'active') throw Object.assign(new Error('Sender wallet is not active'), { code: 'WALLET_INACTIVE' });
      if (lockedRecipient.status !== 'active') throw Object.assign(new Error('Recipient wallet is not active'), { code: 'RECIPIENT_INACTIVE' });
      if (Number(lockedSender.balance) < amount) {
        throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });
      }

      const transferId = crypto.randomUUID();
      const senderReference = `FC-OUT-${transferId.slice(0, 12).toUpperCase()}`;
      const recipientReference = `FC-IN-${transferId.slice(0, 12).toUpperCase()}`;
      const metadataBase = { transferId, source: 'internal', version: 1, recipientEmail };

      const senderTransaction = await client.query(
        `INSERT INTO flowcash.transactions
          (wallet_id, type, amount, currency, status, reference, description, metadata)
         VALUES ($1, 'transfer', $2, 'XAF', 'completed', $3, $4, $5::jsonb)
         RETURNING id, type, amount::text, currency, status, reference, description, created_at::text`,
        [senderId, amount, senderReference, description || `Transfert vers ${recipientEmail}`, JSON.stringify({ ...metadataBase, direction: 'outgoing' })],
      );

      const recipientTransaction = await client.query(
        `INSERT INTO flowcash.transactions
          (wallet_id, type, amount, currency, status, reference, description, metadata)
         VALUES ($1, 'transfer', $2, 'XAF', 'completed', $3, $4, $5::jsonb)
         RETURNING id, type, amount::text, currency, status, reference, description, created_at::text`,
        [recipientId, amount, recipientReference, description || `Transfert reçu de ${user.email || user.id}`, JSON.stringify({ ...metadataBase, direction: 'incoming', senderId: user.id })],
      );

      const accounts = await client.query(
        `SELECT id, wallet_id, code
         FROM flowcash.ledger_accounts
         WHERE wallet_id IN ($1, $2) AND code IN ('CASH', 'AVAILABLE')
         ORDER BY wallet_id, code
         FOR UPDATE`,
        [senderId, recipientId],
      );
      const accountMap = new Map(accounts.rows.map((row) => [`${row.wallet_id}:${row.code}`, row.id]));
      const senderAvailable = accountMap.get(`${senderId}:AVAILABLE`);
      const senderCash = accountMap.get(`${senderId}:CASH`);
      const recipientAvailable = accountMap.get(`${recipientId}:AVAILABLE`);
      const recipientCash = accountMap.get(`${recipientId}:CASH`);

      if (!senderAvailable || !senderCash || !recipientAvailable || !recipientCash) {
        throw new Error('Wallet ledger accounts are not provisioned');
      }

      await client.query(
        `INSERT INTO flowcash.ledger_entries
          (transaction_id, account_id, wallet_id, direction, amount, currency)
         VALUES
          ($1, $2, $3, 'debit', $5, 'XAF'),
          ($1, $4, $3, 'credit', $5, 'XAF')`,
        [senderTransaction.rows[0].id, senderAvailable, senderId, senderCash, amount],
      );

      await client.query(
        `INSERT INTO flowcash.ledger_entries
          (transaction_id, account_id, wallet_id, direction, amount, currency)
         VALUES
          ($1, $2, $3, 'debit', $5, 'XAF'),
          ($1, $4, $3, 'credit', $5, 'XAF')`,
        [recipientTransaction.rows[0].id, recipientCash, recipientId, recipientAvailable, amount],
      );

      const senderUpdate = await client.query(
        `UPDATE flowcash.wallets
         SET balance = balance - $1, updated_at = now()
         WHERE id = $2 AND balance >= $1
         RETURNING balance::text, currency`,
        [amount, senderId],
      );
      if (!senderUpdate.rows[0]) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });

      const recipientUpdate = await client.query(
        `UPDATE flowcash.wallets
         SET balance = balance + $1, updated_at = now()
         WHERE id = $2
         RETURNING balance::text, currency`,
        [amount, recipientId],
      );
      if (!recipientUpdate.rows[0]) throw new Error('Recipient balance update failed');

      const response = {
        transferId,
        transaction: senderTransaction.rows[0],
        recipientTransaction: recipientTransaction.rows[0],
        wallet: senderUpdate.rows[0],
      };

      await client.query(
        `UPDATE flowcash.idempotency_keys
         SET status = 'completed', transaction_id = $1, response = $2::jsonb, updated_at = now()
         WHERE user_id = $3 AND idempotency_key = $4`,
        [senderTransaction.rows[0].id, JSON.stringify(response), user.id, idempotencyKey],
      );

      return { replay: false, response };
    });

    return Response.json(result.response, { status: result.replay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : '';
    if (code === 'IDEMPOTENCY_CONFLICT') return jsonError('Idempotency key conflict', 409);
    if (code === 'IDEMPOTENCY_PROCESSING') return jsonError('Request already processing', 409);
    if (code === 'RECIPIENT_NOT_FOUND') return jsonError('Recipient not found', 404);
    if (code === 'SELF_TRANSFER') return jsonError('You cannot transfer money to yourself', 400);
    if (code === 'RECIPIENT_INACTIVE') return jsonError('Recipient wallet is not active', 403);
    if (code === 'WALLET_NOT_FOUND') return jsonError('Wallet not found', 404);
    if (code === 'WALLET_INACTIVE') return jsonError('Wallet is not active', 403);
    if (code === 'INSUFFICIENT_BALANCE') return jsonError('Insufficient balance', 422);

    console.error('FlowCash internal transfer failed', error);
    return jsonError('Unable to complete transfer', 500);
  }
}
