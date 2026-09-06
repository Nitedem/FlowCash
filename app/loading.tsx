export default function Loading() {
  return (
    <main className="auth-shell" aria-busy="true" aria-live="polite">
      <section className="auth-card">
        <span className="status">FLOWCASH</span>
        <h1>Chargement…</h1>
        <p>Nous préparons votre espace FlowCash.</p>
      </section>
    </main>
  );
}
