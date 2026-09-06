import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const rows = await sql`
    SELECT id, requester_user_id, payer_user_id, amount::text, currency, description,
           status, expires_at::text, created_at::text, updated_at::text,
           CASE WHEN payer_user_id = ${user.id} THEN true ELSE false END AS is_payer
    FROM flowcash.payment_requests
    WHERE requester_user_id = ${user.id} OR payer_user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return Response.json({ paymentRequests: rows });
}
