import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const [wallets, unbalancedTransactions, orphanTransactions, acceptedRequests] = await Promise.all([
    sql`
      SELECT w.id, w.currency, w.balance::text,
        COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount ELSE -le.amount END) FILTER (WHERE la.code='AVAILABLE'),0)::text AS ledger_available
      FROM flowcash.wallets w
      LEFT JOIN flowcash.ledger_accounts la ON la.wallet_id=w.id AND la.code='AVAILABLE'
      LEFT JOIN flowcash.ledger_entries le ON le.account_id=la.id
      WHERE w.user_id=${user.id}
      GROUP BY w.id, w.currency, w.balance
      ORDER BY w.currency
    `,
    sql`
      SELECT t.id,t.reference,t.amount::text,t.currency,t.status,
        COALESCE(SUM(CASE WHEN le.direction='debit' THEN le.amount ELSE 0 END),0)::text AS debits,
        COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount ELSE 0 END),0)::text AS credits
      FROM flowcash.transactions t
      JOIN flowcash.wallets w ON w.id=t.wallet_id AND w.user_id=${user.id}
      LEFT JOIN flowcash.ledger_entries le ON le.transaction_id=t.id
      GROUP BY t.id,t.reference,t.amount,t.currency,t.status
      HAVING COALESCE(SUM(CASE WHEN le.direction='debit' THEN le.amount ELSE 0 END),0) <> COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount ELSE 0 END),0)
    `,
    sql`
      SELECT t.id,t.reference,t.amount::text,t.currency,t.status
      FROM flowcash.transactions t
      JOIN flowcash.wallets w ON w.id=t.wallet_id AND w.user_id=${user.id}
      LEFT JOIN flowcash.ledger_entries le ON le.transaction_id=t.id
      WHERE le.id IS NULL
      ORDER BY t.created_at DESC
      LIMIT 100
    `,
    sql`
      SELECT pr.id,pr.amount::text,pr.currency,pr.status,pr.accepted_at::text,
        COUNT(t.id)::int AS linked_transactions
      FROM flowcash.payment_requests pr
      LEFT JOIN flowcash.transactions t
        ON t.metadata->>'paymentRequestId'=pr.id::text AND t.status='completed'
      WHERE pr.requester_user_id=${user.id} AND pr.status='accepted'
      GROUP BY pr.id,pr.amount,pr.currency,pr.status,pr.accepted_at
      HAVING COUNT(t.id)=0
      ORDER BY pr.accepted_at DESC
      LIMIT 100
    `,
  ]);

  const walletDiscrepancies = wallets.filter((wallet) => Number(wallet.balance) !== Number(wallet.ledger_available));
  const healthy = walletDiscrepancies.length === 0 && unbalancedTransactions.length === 0 && orphanTransactions.length === 0 && acceptedRequests.length === 0;

  return Response.json({
    healthy,
    checkedAt: new Date().toISOString(),
    walletDiscrepancies,
    unbalancedTransactions,
    orphanTransactions,
    acceptedRequestsWithoutSettlement: acceptedRequests,
    summary: {
      walletsChecked: wallets.length,
      walletDiscrepancies: walletDiscrepancies.length,
      unbalancedTransactions: unbalancedTransactions.length,
      orphanTransactions: orphanTransactions.length,
      acceptedRequestsWithoutSettlement: acceptedRequests.length,
    },
  });
}
