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
    RETURNING id
  `;

  return Response.json({ expired: expired.length });
}

export async function GET(request: Request) {
  return POST(request);
}
