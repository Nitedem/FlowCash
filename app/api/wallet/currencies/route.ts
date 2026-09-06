import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';
import { CURRENCY_MAP, isSupportedCurrency } from '@/lib/fx/currencies';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const wallets = await sql`SELECT id,public_code,currency,balance::text,status FROM flowcash.wallets WHERE user_id=${user.id} ORDER BY currency`;
  return Response.json({ wallets, currencies: Object.values(CURRENCY_MAP) });
}

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  let body: { currency?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : '';
  if (!isSupportedCurrency(currency)) return Response.json({ error: 'Devise non prise en charge.' }, { status: 400 });

  await sql`
    INSERT INTO flowcash.profiles (id,full_name,email) VALUES (${user.id},${user.name || user.email || null},${user.email?.trim().toLowerCase() || null})
    ON CONFLICT (id) DO UPDATE SET email=COALESCE(EXCLUDED.email,flowcash.profiles.email),updated_at=now()`;
  const walletRows = await sql`
    INSERT INTO flowcash.wallets (user_id,currency) VALUES (${user.id},${currency})
    ON CONFLICT (user_id,currency) DO UPDATE SET updated_at=now()
    RETURNING id,public_code,balance::text,currency,status`;
  const wallet = walletRows[0];
  await sql`
    INSERT INTO flowcash.ledger_accounts (wallet_id,code,currency)
    VALUES (${wallet.id},'CASH',${currency}),(${wallet.id},'AVAILABLE',${currency})
    ON CONFLICT (wallet_id,code) DO NOTHING`;
  return Response.json({ wallet }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  let body: { walletId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const walletId = typeof body.walletId === 'string' ? body.walletId.trim() : '';
  if (!walletId) return Response.json({ error: 'Wallet ID required' }, { status: 400 });

  const rows = await sql`SELECT id,public_code,currency,balance::text,status FROM flowcash.wallets WHERE id=${walletId} AND user_id=${user.id} LIMIT 1` as { id: string; public_code: string; currency: string; balance: string; status: string }[];
  const wallet = rows[0];
  if (!wallet) return Response.json({ error: 'Portefeuille introuvable.' }, { status: 404 });
  if (wallet.currency === 'XAF') return Response.json({ error: 'Le portefeuille XAF principal ne peut pas être supprimé.' }, { status: 400 });
  if (wallet.status === 'closed') return Response.json({ error: 'Ce portefeuille est déjà fermé.' }, { status: 400 });
  if (Number(wallet.balance) !== 0) return Response.json({ error: 'Le portefeuille doit avoir un solde nul avant sa suppression.' }, { status: 409 });

  const transactionRows = await sql`SELECT 1 FROM flowcash.transactions WHERE wallet_id=${wallet.id} LIMIT 1`;
  if (transactionRows.length > 0) return Response.json({ error: 'Ce portefeuille possède un historique financier et ne peut pas être supprimé.' }, { status: 409 });

  await sql`UPDATE flowcash.wallets SET status='closed',updated_at=now() WHERE id=${wallet.id} AND user_id=${user.id}`;
  return Response.json({ ok: true, wallet: { ...wallet, status: 'closed' } });
}
