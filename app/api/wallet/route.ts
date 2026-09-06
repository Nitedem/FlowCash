import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  const user = session?.user;

  if (!user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const wallets = await sql`
    SELECT id, balance::text, currency, status, created_at::text, updated_at::text
    FROM flowcash.wallets
    WHERE user_id = ${user.id} AND currency = 'XAF'
    LIMIT 1
  `;

  if (!wallets[0]) {
    return Response.json({ error: 'Wallet not provisioned' }, { status: 404 });
  }

  return Response.json({ wallet: wallets[0] });
}
