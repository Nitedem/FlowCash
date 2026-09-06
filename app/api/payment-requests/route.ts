import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';
import { isSupportedCurrency } from '@/lib/fx/currencies';

export const dynamic = 'force-dynamic';
const MAX_AMOUNT = 100_000_000;
const MAX_DESCRIPTION_LENGTH = 500;

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  let body: { payerEmail?: string; amount?: string; currency?: string; description?: string; expiresInHours?: number };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON invalide.' }, { status: 400 }); }
  const payerEmail = body.payerEmail?.trim().toLowerCase() || '';
  const currency = body.currency?.trim().toUpperCase() || '';
  const description = body.description?.trim() || null;
  const amountRaw = body.amount?.trim() || '';
  const amount = Number(amountRaw);
  if (!payerEmail || payerEmail.length > 320 || !/^\S+@\S+\.\S+$/.test(payerEmail)) return Response.json({ error: 'E-mail du payeur invalide.' }, { status: 400 });
  if (!isSupportedCurrency(currency)) return Response.json({ error: 'Devise non prise en charge.' }, { status: 400 });
  if (!/^\d+(\.\d{1,2})?$/.test(amountRaw) || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return Response.json({ error: 'Montant invalide.' }, { status: 400 });
  if (description && description.length > MAX_DESCRIPTION_LENGTH) return Response.json({ error: 'Description trop longue.' }, { status: 400 });
  if (payerEmail === user.email?.trim().toLowerCase()) return Response.json({ error: 'Vous ne pouvez pas vous demander un paiement à vous-même.' }, { status: 400 });
  const expiresInHours = Math.min(Math.max(Number(body.expiresInHours ?? 72), 1), 168);
  const payer = await sql`SELECT id FROM flowcash.profiles WHERE LOWER(email) = ${payerEmail} LIMIT 1`;
  if (!payer[0]) return Response.json({ error: 'Payeur FlowCash introuvable.' }, { status: 404 });
  const requesterWallet = await sql`SELECT id, currency, status FROM flowcash.wallets WHERE user_id = ${user.id} AND currency = ${currency} LIMIT 1`;
  if (!requesterWallet[0]) return Response.json({ error: 'Votre portefeuille dans cette devise n’est pas encore disponible.' }, { status: 409 });
  if (requesterWallet[0].status !== 'active') return Response.json({ error: 'Votre portefeuille est inactif.' }, { status: 403 });
  const rows = await sql`INSERT INTO flowcash.payment_requests (requester_user_id,payer_user_id,requester_wallet_id,amount,currency,description,expires_at) VALUES (${user.id},${payer[0].id},${requesterWallet[0].id},${amountRaw},${currency},${description},now()+(${expiresInHours} || ' hours')::interval) RETURNING id,amount::text,currency,status,description,expires_at::text,created_at::text`;
  return Response.json({ paymentRequest: rows[0] }, { status: 201 });
}

export async function GET() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const requests = await sql`SELECT id,requester_user_id,payer_user_id,amount::text,currency,description,status,expires_at::text,created_at::text,(payer_user_id=${user.id}) AS is_payer FROM flowcash.payment_requests WHERE requester_user_id=${user.id} OR payer_user_id=${user.id} ORDER BY created_at DESC LIMIT 50`;
  return Response.json({ paymentRequests: requests });
}
