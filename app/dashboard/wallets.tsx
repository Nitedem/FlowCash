'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WalletOperations } from './wallet-operations';
import styles from './wallets.module.css';

type Wallet = { id: string; currency: string; balance: string; status: string };
type Currency = { code: string; name: string; symbol: string };

export function Wallets() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/wallet/currencies', { cache: 'no-store' });
    if (!response.ok) throw new Error('Impossible de charger les portefeuilles.');
    const data = await response.json();
    setWallets(data.wallets || []);
    setCurrencies(data.currencies || []);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Erreur de chargement.'));
  }, []);

  const available = useMemo(() => currencies.filter((currency) => !wallets.some((wallet) => wallet.currency === currency.code)), [currencies, wallets]);

  async function addWallet() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/wallet/currencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: selected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de créer le portefeuille.');
      setSelected('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de créer le portefeuille.');
    } finally {
      setBusy(false);
    }
  }

  async function removeWallet(wallet: Wallet) {
    if (wallet.currency === 'XAF') return;
    if (Number(wallet.balance) !== 0) {
      setError('Un portefeuille doit avoir un solde nul avant sa suppression.');
      return;
    }
    if (!window.confirm(`Supprimer le portefeuille ${wallet.currency} ?`)) return;

    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/wallet/currencies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId: wallet.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de supprimer le portefeuille.');
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de supprimer le portefeuille.');
    } finally {
      setBusy(false);
    }
  }

  const xafWallet = wallets.find((wallet) => wallet.currency === 'XAF' && wallet.status === 'active');

  return (
    <section className="wallets-section" aria-labelledby="wallets-title">
      <div className="transactions-heading">
        <div><small>PORTEFEUILLES</small><h2 id="wallets-title">Vos devises</h2></div>
        <span>{wallets.length} portefeuille{wallets.length > 1 ? 's' : ''}</span>
      </div>
      <div className="wallet-grid">
        {wallets.map((wallet) => (
          <article className="wallet-card" key={wallet.id}>
            <div className={styles.walletCardMain}>
              <div><small>{wallet.currency}</small><strong>{Number(wallet.balance).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <span className={`status-badge status-${wallet.status}`}>{wallet.status === 'active' ? 'Actif' : wallet.status === 'closed' ? 'Fermé' : wallet.status}</span>
            </div>
            {wallet.currency !== 'XAF' && wallet.status === 'active' && (
              <button type="button" className={styles.walletDelete} onClick={() => void removeWallet(wallet)} disabled={busy || Number(wallet.balance) !== 0}>
                Supprimer
              </button>
            )}
          </article>
        ))}
      </div>
      {xafWallet && <WalletOperations wallet={xafWallet} />}
      {available.length > 0 && (
        <div className="wallet-add-row">
          <select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Nouvelle devise">
            <option value="">Ajouter une devise</option>
            {available.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}
          </select>
          <button type="button" onClick={() => void addWallet()} disabled={!selected || busy}>{busy ? 'Création…' : 'Ajouter'}</button>
        </div>
      )}
      <p className={styles.walletManagementNote}>Le portefeuille XAF principal reste actif. Les autres portefeuilles peuvent être supprimés uniquement lorsqu’ils sont vides et sans historique financier.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
