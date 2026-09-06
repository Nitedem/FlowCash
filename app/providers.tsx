'use client';

import { NeonAuthUIProvider } from '@neondatabase/auth-ui';
import '@neondatabase/auth-ui/css';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { authClient } from '@/lib/auth/client';

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      redirectTo="/dashboard"
    >
      {children}
    </NeonAuthUIProvider>
  );
}
