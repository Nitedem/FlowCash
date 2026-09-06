'use client';

import { useEffect, useMemo, useState } from 'react';
import { CURRENCIES } from '@/lib/fx/currencies';

export function FxConverter() {
  const [from, setFrom] = useState('XAF');
  const [to, setTo] = useState('EUR');
  const [amount, setAmount] = useState('10000');
  const [converted, setConverted] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fromMeta = useMemo(() => CURRENCIES.find(([code]) => code === from), [from]);
  const toMeta = useMemo(() => CURRENCIES.find(([code]) => code === to), [to]);

  useEffect(() => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setConverted(null);
      setRate(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage('');
      try {
        const response = await fetch(`/api/fx/quote?from=${from}&to=${to}&amount=${encodeURIComponent(amount)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Conversion indisponible');
        setConverted(data.convertedAmount);
        setRate(data.rate);
        setRateDate(data.rateDate ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setConverted(null);
        setRate(null);
        setMessage(error instanceof Error ? error.message : 'Conversion indisponible');
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [amount, from, to]);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  return (
    <section className="fx-section">
      <div>
        <small>CONVERSION INTERNATIONALE</small>
        <h2>Convertir instantanément</h2>
        <p className="fx-note">Taux indicatif en temps réel disponible. Le taux final d’un paiement sera verrouillé au moment de son exécution.</p>
      </div>
      <div className="fx-grid">
        <label>
          Montant
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="10000" />
        </label>
        <label>
          De
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {CURRENCIES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
          </select>
        </label>
        <button type="button" className="fx-swap" onClick={swap} aria-label="Inverser les devises">⇄</button>
        <label>
          Vers
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {CURRENCIES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
          </select>
        </label>
      </div>
      <div className="fx-result" aria-live="polite">
        {loading ? 'Actualisation du taux…' : converted !== null && fromMeta && toMeta ? (
          <>
            <strong>{converted.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {toMeta[0]}</strong>
            <span>{Number(amount).toLocaleString('fr-FR')} {fromMeta[0]} → {converted.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {toMeta[0]}</span>
            {rate !== null && <span>1 {from} = {rate.toLocaleString('fr-FR', { maximumFractionDigits: 8 })} {to}{rateDate ? ` · taux du ${rateDate}` : ''}</span>}
          </>
        ) : message ? message : 'Saisissez un montant pour obtenir une conversion.'}
      </div>
    </section>
  );
}
