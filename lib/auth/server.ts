import { createNeonAuth } from '@neondatabase/auth/next/server';

const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

// Next.js evaluates the auth module during the production build. Vercel will
// provide the real secret through Environment Variables at runtime.
// This fallback only keeps the build from failing when the secret has not yet
// been configured in Vercel.
const buildCookieSecret = 'flowcash-build-only-cookie-secret-2026-never-use-at-runtime-64';

export const auth = createNeonAuth({
  baseUrl:
    process.env.NEON_AUTH_BASE_URL ||
    'https://ep-lively-truth-aee04hj0.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth',
  cookies: {
    secret: cookieSecret || buildCookieSecret,
  },
});
