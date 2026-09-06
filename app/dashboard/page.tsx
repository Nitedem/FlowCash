import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db/server';
import { FxConverter } from './fx-converter';
import { Notifications } from './notifications';
import { PaymentRequestHistory } from './payment-request-history';
import { PaymentRequests } from './payment-requests';
import { TransferForm } from './transfer-form';
import { Wallets } from './wallets';

export const dynamic = 'force-dynamic';
type WalletRow = { id: string; balance: string; currency: string; status: string };
type TransactionRow = { id: string; type: string; amount: string; currency: string; status: string; reference: string; description: string | null; created_at: string };
const transactionLabels: Record<string, string> = { deposit: 'Dépôt', withdrawal: 'Retrait', transfer: 'Transfert', payment: 'Paiement', refund: 'Remboursement' };
const statusLabels: Record<string, string> = { completed: 'Réussie', pending: 'En attente', failed: 'Échouée' };
function formatAmount(amount: string, currency: string) { return `${Number(amount).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function transactionSign(type: string) { return type === 'deposit' || type === 'refund' ? '+' : '−'; }

async function ensureWallet(userId: string, name?: string | null, email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase() || null;

  // Keep email globally unique. If another FlowCash financial profile already owns it,
  // never merge/reassign financial identities and never let the unique index crash the dashboard.
  if (normalizedEmail) {
    const owners = await sql`SELECT id FROM flowcash.profiles WHERE lower(email)=${normalizedEmail} LIMIT 1` as { id: string }[];
    const emailOwner = owners[0]?.id;
    if (emailOwner && emailOwner !== userId) throw new Error('EMAIL_ALREADY_LINKED');
  }

  await sql`INSERT INTO flowcash.profiles (id,full_name,email) VALUES (${userId},${name||normalizedEmail||null},${normalizedEmail}) ON CONFLICT (id) DO UPDATE SET full_name=COALESCE(EXCLUDED.full_name,flowcash.profiles.full_name),email=COALESCE(EXCLUDED.email,flowcash.profiles.email),updated_at=now()`;
  const wallets = await sql`INSERT INTO flowcash.wallets (user_id,currency) VALUES (${userId},'XAF') ON CONFLICT (user_id,currency) DO UPDATE SET updated_at=now() RETURNING id,balance::text,currency,status`;
  const wallet = wallets[0] as WalletRow|undefined; if(!wallet)throw new Error('Wallet could not be provisioned');
  await sql`INSERT INTO flowcash.ledger_accounts (wallet_id,code,currency) VALUES (${wallet.id},'CASH','XAF'),(${wallet.id},'AVAILABLE','XAF') ON CONFLICT (wallet_id,code) DO NOTHING`;
  return wallet;
}

export default async function DashboardPage() {
  const { data: session } = await auth.getSession(); const user = session?.user;
  if(!user)return <main className="dashboard-shell"><div className="dashboard-card"><span className="status">FLOWCASH</span><h1>Session requise</h1><p>Connectez-vous pour accéder à votre portefeuille.</p></div></main>;

  let wallet: WalletRow;
  try { wallet = await ensureWallet(user.id,user.name,user.email); }
  catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_ALREADY_LINKED') {
      return <main className="dashboard-shell"><div className="dashboard-card"><span className="status">FLOWCASH</span><h1>Compte déjà associé</h1><p>Cette adresse e-mail est déjà associée à un autre compte FlowCash. Vos données financières ne seront pas fusionnées automatiquement.</p></div></main>;
    }
    throw error;
  }

  const transactions=(await sql`SELECT id,type,amount::text,currency,status,reference,description,created_at::text FROM flowcash.transactions WHERE wallet_id IN (SELECT id FROM flowcash.wallets WHERE user_id=${user.id}) ORDER BY created_at DESC LIMIT 20`) as TransactionRow[];
  const walletCountRows=await sql`SELECT count(*)::int AS count FROM flowcash.wallets WHERE user_id=${user.id}` as {count:number}[];
  const walletCount=walletCountRows[0]?.count ?? 1;
  return <main className="dashboard-shell"><div className="dashboard-card"><div className="dashboard-topbar"><span className="status">FLOWCASH</span><Notifications/></div><h1>Bonjour {user.name||'à vous'}.</h1><p>Votre portefeuille FlowCash est connecté à votre compte financier.</p><div className="dashboard-grid"><section><small>SOLDE XAF</small><strong>{formatAmount(wallet.balance,wallet.currency)}</strong></section><section><small>PORTEFEUILLES</small><strong>{walletCount}</strong></section></div><Wallets/><FxConverter/><TransferForm/><PaymentRequests/><PaymentRequestHistory/><section className="transactions-section" aria-labelledby="transactions-title"><div className="transactions-heading"><div><small>ACTIVITÉ FINANCIÈRE</small><h2 id="transactions-title">Historique des opérations</h2></div><span>{transactions.length} opération{transactions.length>1?'s':''}</span></div>{transactions.length===0?<div className="transactions-empty"><strong>Aucune opération</strong><p>Vos mouvements financiers apparaîtront ici.</p></div>:<div className="transactions-list">{transactions.map(t=><article key={t.id} className={`transaction-row transaction-${t.status}`}><div className="transaction-main"><div className="transaction-icon" aria-hidden="true">{transactionSign(t.type)}</div><div><strong>{t.description||transactionLabels[t.type]||t.type}</strong><small>{transactionLabels[t.type]||t.type} · {t.currency} · {formatDate(t.created_at)}</small><small className="transaction-reference">Réf. {t.reference}</small></div></div><div className="transaction-meta"><strong>{transactionSign(t.type)}{formatAmount(t.amount,t.currency)}</strong><span className={`status-badge status-${t.status}`}>{statusLabels[t.status]||t.status}</span></div></article>)}</div>}</section></div></main>;
}
