'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Wallet = { id: string; currency: string; balance: string; status: string };

const MAX_TEST_DEPOSIT = 10_000_000;

export function WalletOperations({ wallet }: { wallet: Wallet }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (wallet.currency !== 'XAF' || wallet.status !== 'active') return null;

  async function deposit() {
    const normalized = amount.replace(/\D/g, '');
    const value = Number(normalized);
    setError('');
    setMessage('');

    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TEST_DEPOSIT) {
      setError(`Le dépôt test doit être compris entre 1 et ${MAX_TEST_DEPOSIT.toLocaleString('fr-FR')} XAF.`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/wallet/operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ type: 'deposit', amount: value, description: 'Dépôt test FlowCash' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Dépôt impossible.');
      setAmount('');
      setMessage(`Dépôt confirmé : ${value.toLocaleString('fr-FR')} XAF.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dépôt impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wallet-operations" aria-label="Opérations du portefeuille XAF">
      <div className="wallet-operation-head">
        <div>
          <small>OPÉRATIONS</small>
          <strong>Ajouter des fonds</strong>
        </div>
        <span>TEST</span>
      </div>
      <div className="wallet-operation-form">
        <label>
          Montant du dépôt
          <div className="wallet-operation-input">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
              placeholder="10 000"
              aria-label="Montant du dépôt en XAF"
            />
            <span>XAF</span>
          </div>
        </label>
        <button type="button" onClick={() => void deposit()} disabled={busy || !amount}>
          {busy ? 'Dépôt en cours…' : 'Déposer maintenant'}
        </button>
      </div>
      <p className="wallet-operation-note">Dépôt de test uniquement · maximum {MAX_TEST_DEPOSIT.toLocaleString('fr-FR')} XAF.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
