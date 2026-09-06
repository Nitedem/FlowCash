export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="brand">FLOW<span>CASH</span></div>
        <div className="status">CONSTRUCTION EN COURS</div>
        <h1>Votre argent.<br />Plus simple. Plus fluide.</h1>
        <p>
          FlowCash devient une plateforme moderne de paiement et de gestion financière,
          conçue pour évoluer de manière sécurisée.
        </p>
        <div className="actions">
          <button>Créer un compte</button>
          <button className="secondary">Se connecter</button>
        </div>
      </section>
      <section className="features">
        <article><strong>01</strong><h2>Portefeuille</h2><p>Suivez votre solde et vos mouvements financiers.</p></article>
        <article><strong>02</strong><h2>Transactions</h2><p>Une base fiable pour gérer les opérations.</p></article>
        <article><strong>03</strong><h2>Sécurité</h2><p>Une architecture pensée pour protéger chaque opération.</p></article>
      </section>
    </main>
  );
}
