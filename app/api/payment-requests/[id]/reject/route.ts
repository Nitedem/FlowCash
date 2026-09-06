import { auth } from '@/lib/auth/server';
import { withTransaction } from '@/lib/db/transaction';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) { return Response.json({ error: message }, { status }); }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return jsonError('Authentication required', 401);
  const { id } = await params;
  try {
    const result = await withTransaction(async (client) => {
      const row = await client.query(`SELECT id,status,expires_at FROM flowcash.payment_requests WHERE id=$1 AND payer_user_id=$2 FOR UPDATE`, [id,user.id]);
      const pr = row.rows[0];
      if (!pr) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
      if (pr.status !== 'pending') throw Object.assign(new Error('Not pending'), { code: 'NOT_PENDING' });
      const status = pr.expires_at && new Date(pr.expires_at).getTime() <= Date.now() ? 'expired' : 'rejected';
      await client.query(`UPDATE flowcash.payment_requests SET status=$1,rejected_at=CASE WHEN $1='rejected' THEN now() ELSE rejected_at END,updated_at=now() WHERE id=$2`, [status,id]);
      return { id, status };
    });
    return Response.json({ paymentRequest: result });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as {code:string}).code) : '';
    if (code === 'NOT_FOUND') return jsonError('Payment request not found',404);
    if (code === 'NOT_PENDING') return jsonError('Payment request is no longer pending',409);
    return jsonError('Unable to reject payment request',500);
  }
}
