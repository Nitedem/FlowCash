'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_TRANSFER_XAF = 100_000_000;

export function TransferForm() {
  const router = useRouter();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const normalizedEmail = recipientEmail.trim().toLowerCase();
    const normalizedAmount = amount.trim();

    if (!/^\d+$/.test(normalizedAmount)) {
      setMessage('Le montant doit être un nombre entier positif.');
      setBusy(false);
      return;
    }

    const amountNumber = Number(normalizedAmount);
    if (!Number.isSafeInteger(amountNumber) || amountNumber <= 0 || amountNumber > MAX_TRANSFER_XAF) {
      setMessage(`Le montant doit être compris entre 1 et ${MAX_TRANSFER_XAF.toLocaleString('fr-FR')} XAF.`);
      setBusy(false);
      return;
    }

    if (!normalizedEmail || normalizedEmail.length > 320) {
      setMessage('Veuillez saisir une adresse e-mail valide.');
      setBusy(false);
      return;
    }

    try {
      const response = await fetch('/api/wallet/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ recipientEmail: normalizedEmail, amount: normalizedAmount, description: description.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Transfert impossible');

      setMessage(`Transfert confirmé : ${Number(data.transaction.amount).toLocaleString('fr-FR')} XAF.`);
      setRecipientEmail('');
      setAmount('');
      setDescription('');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="transfer-section">
      <div>
        <small>ENVOYER DE L’ARGENT</small>
        <h2>Transfert FlowCash</h2>
      </div>
      <form onSubmit={submit} className="transfer-form">
        <label>
          E-mail du bénéficiaire
          <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} required placeholder="beneficiaire@email.com" autoComplete="email" maxLength={320} />
        </label>
        <label>
          Montant (XAF)
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required placeholder="10000" autoComplete="off" />
        </label>
        <label>
          Motif (facultatif)
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Ex. Paiement" />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Traitement sécurisé…' : 'Envoyer maintenant'}</button>
        {message && <p role="status" aria-live="polite">{message}</p>}
      </form>
    </section>
  );
}
