'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
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
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const digits = Array.from({ length: 6 }, (_, index) => otp[index] || '');

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = digits.map((item, itemIndex) => (itemIndex === index ? digit : item)).join('');
    setOtp(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 5) otpRefs.current[index + 1]?.focus();
  }

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

          <div>
            <label>Code de vérification</label>
            <div className="otp-grid" aria-label="Code de vérification à 6 chiffres">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => { otpRefs.current[index] = element; }}
                  className="otp-cell"
                  inputMode="numeric"
                  pattern="[0-9]"
                  maxLength={1}
                  value={digit}
                  onChange={(event) => updateDigit(index, event.target.value)}
                  onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  aria-label={`Chiffre ${index + 1}`}
                  required
                />
              ))}
            </div>
          </div>

          {error && <p role="alert">{error}</p>}
          {message && <p className="auth-message">{message}</p>}

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
