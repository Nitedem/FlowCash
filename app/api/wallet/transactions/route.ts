import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  const user = session?.user;

  if (!user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const transactions = await sql`
    SELECT t.id, t.type, t.amount::text, t.currency, t.status,
           t.reference, t.description, t.created_at::text
    FROM flowcash.transactions t
    JOIN flowcash.wallets w ON w.id = t.wallet_id
    WHERE w.user_id = ${user.id}
    ORDER BY t.created_at DESC
    LIMIT 50
  `;

  return Response.json({ transactions });
}
