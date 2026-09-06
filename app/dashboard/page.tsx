import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

type WalletRow = {
  id: string;
  balance: string;
  currency: string;
  status: string;
};

type TransactionRow = {
  id: string;
  type: string;
  amount: string;
  currency: string;
  status: string;
  reference: string;
  description: string | null;
  created_at: string;
};

async function ensureWallet(userId: string, name?: string | null, email?: string | null) {
  await sql`
    INSERT INTO flowcash.profiles (id, full_name)
    VALUES (${userId}, ${name || email || null})
    ON CONFLICT (id) DO UPDATE SET
      full_name = COALESCE(EXCLUDED.full_name, flowcash.profiles.full_name),
      updated_at = now()
  `;

  const wallets = await sql<WalletRow[]>`
    INSERT INTO flowcash.wallets (user_id, currency)
    VALUES (${userId}, 'XAF')
    ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = now()
    RETURNING id, balance::text, currency, status
  `;

  const wallet = wallets[0];

  await sql`
    INSERT INTO flowcash.ledger_accounts (wallet_id, code, currency)
    VALUES (${wallet.id}, 'CASH', 'XAF')
    ON CONFLICT (wallet_id, code) DO NOTHING
  `;

  return wallet;
}

export default async function DashboardPage() {
  const { data: session } = await auth.getSession();
  const user = session?.user;

  if (!user) {
    return (
      <main className="dashboard-shell">
        <div className="dashboard-card">
          <span className="status">FLOWCASH</span>
          <h1>Session requise</h1>
          <p>Connectez-vous pour accéder à votre portefeuille.</p>
        </div>
      </main>
    );
  }

  const wallet = await ensureWallet(user.id, user.name, user.email);
  const transactions = await sql<TransactionRow[]>`
    SELECT id, type, amount::text, currency, status, reference, description, created_at::text
    FROM flowcash.transactions
    WHERE wallet_id = ${wallet.id}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  return (
    <main className="dashboard-shell">
      <div className="dashboard-card">
        <span className="status">FLOWCASH</span>
        <h1>Bonjour {user.name || 'à vous'}.</h1>
        <p>Votre portefeuille FlowCash est maintenant connecté à votre compte financier.</p>
        <div className="dashboard-grid">
          <section><small>SOLDE</small><strong>{Number(wallet.balance).toLocaleString('fr-FR')} {wallet.currency}</strong></section>
          <section><small>TRANSACTIONS</small><strong>{transactions.length}</strong></section>
        </div>
        <section className="transactions-section">
          <h2>Dernières transactions</h2>
          {transactions.length === 0 ? (
            <p>Aucune transaction pour le moment.</p>
          ) : (
            <div className="transactions-list">
              {transactions.map((transaction) => (
                <article key={transaction.id}>
                  <div>
                    <strong>{transaction.description || transaction.type}</strong>
                    <small>{transaction.reference}</small>
                  </div>
                  <strong>{Number(transaction.amount).toLocaleString('fr-FR')} {transaction.currency}</strong>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
