import { auth } from '@/lib/auth/server';
import { withTransaction } from '@/lib/db/transaction';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return jsonError('Authentication required', 401);

  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase() || '';
  if (!/^FCW-[A-Z0-9]{12}$/.test(code)) return jsonError('Invalid wallet code', 400);

  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT p.id AS user_id, p.full_name, w.id AS wallet_id, w.public_code, w.currency, w.balance::text AS balance, w.status
         FROM flowcash.wallets w
         JOIN flowcash.profiles p ON p.id = w.user_id
         WHERE w.public_code = $1
         LIMIT 1`,
        [code],
      );
      const wallet = rows[0];
      if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'NOT_FOUND' });
      if (wallet.user_id === user.id) throw Object.assign(new Error('Self wallet'), { code: 'SELF' });
      if (wallet.status !== 'active') throw Object.assign(new Error('Wallet inactive'), { code: 'INACTIVE' });
      return {
        name: wallet.full_name || 'Utilisateur FlowCash',
        walletCode: wallet.public_code,
        currency: wallet.currency,
        status: wallet.status,
      };
    });
    return Response.json(result);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : '';
    if (code === 'NOT_FOUND') return jsonError('Portefeuille bénéficiaire introuvable', 404);
    if (code === 'SELF') return jsonError('Ce portefeuille appartient à votre compte', 400);
    if (code === 'INACTIVE') return jsonError('Le portefeuille bénéficiaire n’est pas actif', 403);
    console.error('FlowCash wallet resolution failed', error);
    return jsonError('Impossible de vérifier ce portefeuille', 500);
  }
}
