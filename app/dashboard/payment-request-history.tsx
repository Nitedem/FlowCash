'use client';

import { useEffect, useState } from 'react';

type Row = { id: string; amount: string; currency: string; description: string | null; status: string; expires_at: string | null; created_at: string; is_payer: boolean };
const labels: Record<string, string> = { pending: 'En attente', accepted: 'Acceptée', rejected: 'Refusée', expired: 'Expirée', cancelled: 'Annulée' };

export function PaymentRequestHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/payment-requests/my', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les demandes.');
        setRows(data.paymentRequests || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur de chargement.'));
  }, []);

  if (error) return <section className="transactions-section"><p className="form-error">{error}</p></section>;
  if (!rows.length) return null;

  return (
    <section className="transactions-section" aria-labelledby="payment-history-title">
      <div className="transactions-heading"><div><small>SUIVI DES DEMANDES</small><h2 id="payment-history-title">Demandes de paiement</h2></div><span>{rows.length}</span></div>
      <div className="transactions-list">
        {rows.map((row) => (
          <article className="transaction-row" key={row.id}>
            <div className="transaction-main">
              <div className="transaction-icon" aria-hidden="true">{row.is_payer ? '−' : '+'}</div>
              <div>
                <strong>{row.description || 'Demande de paiement'}</strong>
                <small>{row.is_payer ? 'À payer' : 'À recevoir'} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.created_at))}</small>
              </div>
            </div>
            <div className="transaction-meta">
              <strong>{Number(row.amount).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</strong>
              <span className={`status-badge status-${row.status}`}>{labels[row.status] || row.status}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
