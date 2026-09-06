'use client';

import { useEffect } from 'react';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the production UI usable even when a server component fails.
    // The detailed error is intentionally not rendered to users.
  }, []);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="status">FLOWCASH</span>
        <h1>Une erreur est survenue</h1>
        <p>La page n’a pas pu être chargée correctement. Réessayez sans perdre votre session.</p>
        <button type="button" onClick={() => reset()}>Réessayer</button>
        <p><a href="/">Retour à l’accueil</a></p>
      </section>
    </main>
  );
}
