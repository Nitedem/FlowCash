import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';
import { FxConverter } from './fx-converter';
import { PaymentRequests } from './payment-requests';
import { TransferForm } from './transfer-form';

export const dynamic = 'force-dynamic';
type WalletRow = { id: string; balance: string; currency: string; status: string };
type TransactionRow = { id: string; type: string; amount: string; currency: string; status: string; reference: string; description: string | null; created_at: string };
const transactionLabels: Record<string, string> = { deposit: 'Dépôt', withdrawal: 'Retrait', transfer: 'Transfert', payment: 'Paiement', refund: 'Remboursement' };
const statusLabels: Record<string, string> = { completed: 'Réussie', pending: 'En attente', failed: 'Échouée' };
function formatAmount(amount: string, currency: string) { return `${Number(amount).toLocaleString('fr-FR')} ${currency}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function transactionSign(type: string) { return type === 'deposit' || type === 'refund' ? '+' : '−'; }
async function ensureWallet(userId: string, name?: string | null, email?: string | null) {
  await sql`INSERT INTO flowcash.profiles (id,full_name,email) VALUES (${userId},${name||email||null},${email?.trim().toLowerCase()||null}) ON CONFLICT (id) DO UPDATE SET full_name=COALESCE(EXCLUDED.full_name,flowcash.profiles.full_name),email=COALESCE(EXCLUDED.email,flowcash.profiles.email),updated_at=now()`;
  const wallets = await sql`INSERT INTO flowcash.wallets (user_id,currency) VALUES (${userId},'XAF') ON CONFLICT (user_id,currency) DO UPDATE SET updated_at=now() RETURNING id,balance::text,currency,status`;
  const wallet = wallets[0] as WalletRow|undefined; if(!wallet)throw new Error('Wallet could not be provisioned');
  await sql`INSERT INTO flowcash.ledger_accounts (wallet_id,code,currency) VALUES (${wallet.id},'CASH','XAF'),(${wallet.id},'AVAILABLE','XAF') ON CONFLICT (wallet_id,code) DO NOTHING`;
  return wallet;
}
export default async function DashboardPage() {
  const { data: session } = await auth.getSession(); const user = session?.user;
  if(!user)return <main className="dashboard-shell"><div className="dashboard-card"><span className="status">FLOWCASH</span><h1>Session requise</h1><p>Connectez-vous pour accéder à votre portefeuille.</p></div></main>;
  const wallet=await ensureWallet(user.id,user.name,user.email);
  const transactions=(await sql`SELECT id,type,amount::text,currency,status,reference,description,created_at::text FROM flowcash.transactions WHERE wallet_id=${wallet.id} ORDER BY created_at DESC LIMIT 10`) as TransactionRow[];
  return <main className="dashboard-shell"><div className="dashboard-card"><span className="status">FLOWCASH</span><h1>Bonjour {user.name||'à vous'}.</h1><p>Votre portefeuille FlowCash est connecté à votre compte financier.</p><div className="dashboard-grid"><section><small>SOLDE DISPONIBLE</small><strong>{formatAmount(wallet.balance,wallet.currency)}</strong></section><section><small>10 DERNIÈRES OPÉRATIONS</small><strong>{transactions.length}</strong></section></div><FxConverter/><TransferForm/><PaymentRequests/><section className="transactions-section" aria-labelledby="transactions-title"><div className="transactions-heading"><div><small>ACTIVITÉ FINANCIÈRE</small><h2 id="transactions-title">Historique des opérations</h2></div><span>{transactions.length} opération{transactions.length>1?'s':''}</span></div>{transactions.length===0?<div className="transactions-empty"><strong>Aucune opération</strong><p>Vos mouvements financiers apparaîtront ici.</p></div>:<div className="transactions-list">{transactions.map(t=><article key={t.id} className={`transaction-row transaction-${t.status}`}><div className="transaction-main"><div className="transaction-icon" aria-hidden="true">{transactionSign(t.type)}</div><div><strong>{t.description||transactionLabels[t.type]||t.type}</strong><small>{transactionLabels[t.type]||t.type} · {formatDate(t.created_at)}</small><small className="transaction-reference">Réf. {t.reference}</small></div></div><div className="transaction-meta"><strong>{transactionSign(t.type)}{formatAmount(t.amount,t.currency)}</strong><span className={`status-badge status-${t.status}`}>{statusLabels[t.status]||t.status}</span></div></article>)}</div>}</section></div></main>;
}
