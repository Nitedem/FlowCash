'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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

    try {
      const response = await fetch('/api/wallet/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ recipientEmail, amount: Number(amount), description }),
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
          <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} required placeholder="beneficiaire@email.com" autoComplete="email" />
        </label>
        <label>
          Montant (XAF)
          <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="10000" inputMode="numeric" />
        </label>
        <label>
          Motif (facultatif)
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Ex. Paiement" />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Traitement sécurisé…' : 'Envoyer maintenant'}</button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
