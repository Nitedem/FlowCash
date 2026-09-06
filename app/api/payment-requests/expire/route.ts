import { expirePendingPaymentRequests } from '@/lib/payment-requests/expiration';

export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const expected = process.env.FLOWCASH_CRON_SECRET || process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get('authorization') === `Bearer ${expected}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const expired = await expirePendingPaymentRequests();
  return Response.json({ expired });
}

export async function GET(request: Request) {
  return POST(request);
}
