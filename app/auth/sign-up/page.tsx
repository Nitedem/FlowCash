'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: normalizedEmail,
        password,
      });

      if (result.error) {
        setError(result.error.message || 'Impossible de créer le compte.');
        return;
      }

      const otpResult = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: 'email-verification',
      });

      if (otpResult.error) {
        setError(otpResult.error.message || 'Le code de vérification n’a pas pu être envoyé.');
        return;
      }

      router.push(`/auth/verify-email?email=${encodeURIComponent(normalizedEmail)}`);
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Créer votre compte FlowCash</h1>
        <p>Nous allons vous envoyer un code à 6 chiffres pour vérifier votre adresse e-mail.</p>

        <form onSubmit={handleSubmit}>
          <label>
            Nom complet
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

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
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {error && <p role="alert">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Création du compte…' : 'Créer mon compte'}
          </button>
        </form>

        <p>
          Déjà un compte ?{' '}
          <a href="/auth/sign-in">Se connecter</a>
        </p>
      </section>
    </main>
  );
}
