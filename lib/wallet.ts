import { getDb } from '@/lib/db';

export async function ensureDefaultWallet(userId: string) {
  const sql = getDb();

  const profiles = await sql.query(
    'INSERT INTO flowcash.profiles (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET updated_at = now() RETURNING id',
    [userId],
  );
  if (!profiles[0]) throw new Error('Unable to provision profile.');

  const wallets = await sql.query(
    "INSERT INTO flowcash.wallets (user_id, currency) VALUES ($1, 'XAF') ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = now() RETURNING id, currency, balance, status",
    [userId],
  );
  const wallet = wallets[0];
  if (!wallet) throw new Error('Unable to provision wallet.');

  await sql.query(
    "INSERT INTO flowcash.ledger_accounts (wallet_id, code, currency) VALUES ($1, 'AVAILABLE', 'XAF') ON CONFLICT (wallet_id, code) DO NOTHING",
    [wallet.id],
  );

  return wallet;
}
