import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { data: session } = await auth.getSession();
  const user = session?.user;

  return (
    <main className="dashboard-shell">
      <div className="dashboard-card">
        <span className="status">FLOWCASH</span>
        <h1>Bonjour {user?.name || 'à vous'}.</h1>
        <p>Votre espace financier est prêt. Le portefeuille et les transactions arrivent dans la prochaine étape.</p>
        <div className="dashboard-grid">
          <section><small>SOLDE</small><strong>0 XAF</strong></section>
          <section><small>TRANSACTIONS</small><strong>0</strong></section>
        </div>
      </div>
    </main>
  );
}
