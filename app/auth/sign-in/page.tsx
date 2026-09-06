import { AuthView } from '@neondatabase/auth-ui';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <AuthView path="sign-in" />
      </section>
    </main>
  );
}
