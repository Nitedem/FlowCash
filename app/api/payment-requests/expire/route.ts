import { sql } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const expected = process.env.FLOWCASH_CRON_SECRET;
  if (expected && request.headers.get('authorization') !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expired = await sql`
    UPDATE flowcash.payment_requests
    SET status = 'expired', updated_at = now()
    WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING id, requester_user_id, payer_user_id, amount::text, currency
  `;

  for (const row of expired) {
    await sql`
      INSERT INTO flowcash.audit_events (actor_user_id,event_type,entity_type,entity_id,metadata)
      VALUES (NULL,'payment_request.expired','payment_request',${row.id},${JSON.stringify({ amount: row.amount, currency: row.currency })}::jsonb)
    `;
    await sql`
      INSERT INTO flowcash.notifications (user_id,type,title,body,entity_type,entity_id)
      VALUES (${row.requester_user_id},'payment_request.expired','Demande expirée',${`Votre demande de paiement de ${row.amount} ${row.currency} a expiré.`},'payment_request',${row.id})
    `;
    await sql`
      INSERT INTO flowcash.notifications (user_id,type,title,body,entity_type,entity_id)
      VALUES (${row.payer_user_id},'payment_request.expired','Demande expirée',${`Une demande de paiement de ${row.amount} ${row.currency} a expiré.`},'payment_request',${row.id})
    `;
  }

  return Response.json({ expired: expired.length });
}

export async function GET(request: Request) {
  return POST(request);
}
