'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './wallets.module.css';

type Wallet = { id: string; currency: string; balance: string; status: string; public_code?: string };

const MAX_TEST_DEPOSIT = 10_000_000;

export function WalletOperations({ wallet }: { wallet: Wallet }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [operation, setOperation] = useState<'deposit' | 'withdrawal'>('deposit');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (wallet.currency !== 'XAF' || wallet.status !== 'active') return null;

  const value = Number(amount.replace(/\D/g, ''));
  const insufficient = operation === 'withdrawal' && value > Number(wallet.balance);

  function review() {
    setError(''); setMessage('');
    if (!Number.isSafeInteger(value) || value <= 0) { setError('Saisissez un montant valide.'); return; }
    if (operation === 'deposit' && value > MAX_TEST_DEPOSIT) { setError(`Le dépôt test est limité à ${MAX_TEST_DEPOSIT.toLocaleString('fr-FR')} XAF.`); return; }
    if (insufficient) { setError('Le solde disponible est insuffisant pour ce retrait.'); return; }
    setReviewing(true);
  }

  async function confirm() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/wallet/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ type: operation, amount: value, description: operation === 'deposit' ? 'Dépôt test FlowCash' : 'Retrait FlowCash' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Opération impossible.');
      setAmount(''); setReviewing(false);
      setMessage(`${operation === 'deposit' ? 'Dépôt' : 'Retrait'} confirmé — ${data.transaction.movement_code}.`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Opération impossible.'); }
    finally { setBusy(false); }
  }

  return (
    <div className={styles.walletOperations} aria-label="Opérations du portefeuille XAF">
      <div className={styles.walletOperationHead}>
        <div><small>OPÉRATIONS</small><strong>Ajouter ou retirer des fonds</strong></div><span>{operation === 'deposit' ? 'DÉPÔT TEST' : 'RETRAIT'}</span>
      </div>

      {!reviewing ? (
        <>
          <div className={styles.operationSwitch} role="group" aria-label="Type d'opération">
            <button type="button" className={operation === 'deposit' ? styles.operationActive : ''} onClick={() => setOperation('deposit')}>Dépôt</button>
            <button type="button" className={operation === 'withdrawal' ? styles.operationActive : ''} onClick={() => setOperation('withdrawal')}>Retrait</button>
          </div>
          <div className={styles.walletOperationForm}>
            <label>Montant
              <div className={styles.walletOperationInput}><input type="text" inputMode="numeric" pattern="[0-9]*" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="10 000" aria-label="Montant en XAF" /><span>XAF</span></div>
            </label>
            <button type="button" onClick={review} disabled={busy || !amount}>{'Vérifier l’opération'}</button>
          </div>
          <p className={styles.walletOperationNote}>{operation === 'deposit' ? `Dépôt de test uniquement · maximum ${MAX_TEST_DEPOSIT.toLocaleString('fr-FR')} XAF.` : `Solde actuel : ${Number(wallet.balance).toLocaleString('fr-FR')} XAF.`}</p>
        </>
      ) : (
        <div className={styles.confirmationCard}>
          <div className={styles.confirmationWarning}>VALIDATION AVANT EXÉCUTION</div>
          <h3>Récapitulatif</h3>
          <dl className={styles.confirmationGrid}>
            <div><dt>Bénéficiaire</dt><dd>Votre portefeuille</dd></div>
            <div><dt>Portefeuille</dt><dd>{wallet.public_code || 'Portefeuille XAF'}</dd></div>
            <div><dt>Type</dt><dd>{operation === 'deposit' ? 'Dépôt' : 'Retrait'}</dd></div>
            <div><dt>Montant</dt><dd>{value.toLocaleString('fr-FR')} XAF</dd></div>
            <div><dt>Frais</dt><dd>0 XAF</dd></div>
            <div><dt>Solde après</dt><dd>{(Number(wallet.balance) + (operation === 'deposit' ? value : -value)).toLocaleString('fr-FR')} XAF</dd></div>
          </dl>
          <p className={styles.confirmationHint}>{operation === 'deposit' ? 'Il s’agit d’un dépôt de test. Vérifiez le montant avant de continuer.' : 'Vérifiez le montant et le solde disponible avant de confirmer le retrait.'}</p>
          <div className={styles.confirmationActions}>
            <button type="button" onClick={() => setReviewing(false)} disabled={busy}>Modifier</button>
            <button type="button" onClick={() => void confirm()} disabled={busy}>{busy ? 'Exécution sécurisée…' : 'Confirmer et exécuter'}</button>
          </div>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className={styles.formSuccess} role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
