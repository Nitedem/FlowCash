import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  await sql`
    INSERT INTO flowcash.notifications (user_id,type,title,body,entity_type,entity_id,created_at)
    SELECT ${user.id},
      CASE WHEN pr.status='accepted' THEN 'payment_request.accepted' ELSE 'payment_request.rejected' END,
      CASE WHEN pr.status='accepted' THEN 'Paiement reçu' ELSE 'Demande refusée' END,
      CASE WHEN pr.status='accepted'
        THEN format('Votre demande de paiement de %s %s a été acceptée.',pr.amount,pr.currency)
        ELSE format('Votre demande de paiement de %s %s a été refusée.',pr.amount,pr.currency)
      END,
      'payment_request',pr.id,COALESCE(pr.accepted_at,pr.rejected_at,pr.updated_at)
    FROM flowcash.payment_requests pr
    WHERE pr.requester_user_id=${user.id}
      AND pr.status IN ('accepted','rejected')
      AND NOT EXISTS (
        SELECT 1 FROM flowcash.notifications n
        WHERE n.user_id=${user.id} AND n.entity_type='payment_request' AND n.entity_id=pr.id
          AND n.type IN ('payment_request.accepted','payment_request.rejected')
      )
  `;

  const rows = await sql`
    SELECT id, type, title, body, entity_type, entity_id, read_at, created_at
    FROM flowcash.notifications
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return Response.json({ notifications: rows, unread: rows.filter((row) => !row.read_at).length });
}

export async function PATCH(request: Request) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  let body: { id?: unknown; all?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  if (body.all === true) {
    const result = await sql`
      UPDATE flowcash.notifications
      SET read_at = COALESCE(read_at, now())
      WHERE user_id = ${user.id} AND read_at IS NULL
    `;
    return Response.json({ updated: result.count ?? 0 });
  }

  if (typeof body.id !== 'string' || !body.id.trim()) return Response.json({ error: 'Notification id is required' }, { status: 400 });

  const result = await sql`
    UPDATE flowcash.notifications
    SET read_at = COALESCE(read_at, now())
    WHERE id = ${body.id.trim()} AND user_id = ${user.id}
    RETURNING id, read_at
  `;

  if (!result.length) return Response.json({ error: 'Notification not found' }, { status: 404 });
  return Response.json({ notification: result[0] });
}
