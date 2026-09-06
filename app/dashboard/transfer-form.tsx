'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './wallets.module.css';

const MAX_TRANSFER_XAF = 100_000_000;

type Recipient = { name: string; walletCode: string; currency: string; status: string };

export function TransferForm() {
  const router = useRouter();
  const [recipientWalletCode, setRecipientWalletCode] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function review() {
    setBusy(true); setError(''); setMessage(''); setRecipient(null);
    const code = recipientWalletCode.trim().toUpperCase();
    const normalizedAmount = amount.replace(/\D/g, '');
    const value = Number(normalizedAmount);
    if (!/^FCW-[A-Z0-9]{12}$/.test(code)) { setError('Saisissez un identifiant portefeuille FlowCash valide.'); setBusy(false); return; }
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TRANSFER_XAF) { setError(`Le montant doit être compris entre 1 et ${MAX_TRANSFER_XAF.toLocaleString('fr-FR')} XAF.`); setBusy(false); return; }
    try {
      const response = await fetch(`/api/wallet/resolve?code=${encodeURIComponent(code)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Portefeuille introuvable.');
      setRecipient(data);
      setRecipientWalletCode(code);
      setAmount(normalizedAmount);
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible de vérifier le bénéficiaire.'); }
    finally { setBusy(false); }
  }

  async function confirmTransfer() {
    if (!recipient) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/wallet/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ recipientWalletCode, amount: Number(amount), description: description.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Transfert impossible');
      setMessage(`Opération ${data.movementCode} confirmée : ${Number(data.transaction.amount).toLocaleString('fr-FR')} XAF.`);
      setRecipientWalletCode(''); setAmount(''); setDescription(''); setRecipient(null); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Une erreur est survenue.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="transfer-section">
      <div><small>ENVOYER DE L’ARGENT</small><h2>Transfert FlowCash</h2></div>
      {!recipient ? (
        <form onSubmit={(e) => { e.preventDefault(); void review(); }} className="transfer-form">
          <label>Identifiant portefeuille du bénéficiaire
            <input value={recipientWalletCode} onChange={(e) => setRecipientWalletCode(e.target.value.toUpperCase())} required placeholder="FCW-XXXXXXXXXXXX" maxLength={16} autoComplete="off" />
          </label>
          <label>Montant (XAF)
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required placeholder="10000" autoComplete="off" />
          </label>
          <label>Motif (facultatif)
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Ex. Paiement" />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Vérification…' : 'Vérifier le bénéficiaire'}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className={styles.formSuccess} role="status">{message}</p>}
        </form>
      ) : (
        <div className={styles.confirmationCard}>
          <div className={styles.confirmationWarning}>VÉRIFICATION AVANT ENVOI</div>
          <h3>Confirmez le bénéficiaire et l’opération</h3>
          <dl className={styles.confirmationGrid}>
            <div><dt>Bénéficiaire</dt><dd>{recipient.name}</dd></div>
            <div><dt>Portefeuille</dt><dd>{recipient.walletCode}</dd></div>
            <div><dt>Type</dt><dd>Transfert</dd></div>
            <div><dt>Montant</dt><dd>{Number(amount).toLocaleString('fr-FR')} {recipient.currency}</dd></div>
            <div><dt>Frais</dt><dd>0 XAF</dd></div>
            <div><dt>Motif</dt><dd>{description.trim() || 'Aucun motif'}</dd></div>
          </dl>
          <p className={styles.confirmationHint}>Vérifiez soigneusement le nom et l’identifiant du portefeuille. L’envoi ne sera exécuté qu’après votre confirmation.</p>
          <div className={styles.confirmationActions}>
            <button type="button" onClick={() => setRecipient(null)} disabled={busy}>Modifier</button>
            <button type="button" onClick={() => void confirmTransfer()} disabled={busy}>{busy ? 'Exécution sécurisée…' : 'Confirmer et envoyer'}</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
