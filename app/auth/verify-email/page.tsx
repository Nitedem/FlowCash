'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const result = await authClient.emailOtp.verifyEmail({
        email: normalizedEmail,
        otp: otp.trim(),
      });

      if (result.error) {
        setError(result.error.message || 'Code invalide ou expiré.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Impossible de vérifier le code. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setError('');
    setMessage('');
    setResending(true);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: 'email-verification',
      });

      if (result.error) {
        setError(result.error.message || 'Impossible de renvoyer le code.');
        return;
      }

      setMessage('Un nouveau code à 6 chiffres vient d’être envoyé.');
    } catch {
      setError('Impossible de renvoyer le code.');
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Vérifiez votre e-mail</h1>
        <p>Entrez le code à 6 chiffres reçu par e-mail pour activer votre compte FlowCash.</p>

        <form onSubmit={handleVerify}>
          <label>
            Adresse e-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Code de vérification
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
          </label>

          {error && <p role="alert">{error}</p>}
          {message && <p>{message}</p>}

          <button type="submit" disabled={loading || otp.length !== 6}>
            {loading ? 'Vérification…' : 'Vérifier mon compte'}
          </button>
        </form>

        <button type="button" onClick={resendCode} disabled={resending || !normalizedEmail}>
          {resending ? 'Envoi…' : 'Renvoyer le code'}
        </button>

        <p>
          <a href="/auth/sign-in">Retour à la connexion</a>
        </p>
      </section>
    </main>
  );
}
