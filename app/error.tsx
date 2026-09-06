'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
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
