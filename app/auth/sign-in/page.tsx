import { AuthView } from '@neondatabase/auth-ui';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <AuthView path="sign-in" />
    </main>
  );
}
