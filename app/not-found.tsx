import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="status">FLOWCASH</span>
        <h1>Page introuvable</h1>
        <p>Cette page n’existe pas ou n’est plus disponible.</p>
        <Link className="auth-primary-link" href="/">Retour à l’accueil</Link>
      </section>
    </main>
  );
}
