import { createNeonAuth } from '@neondatabase/auth/next/server';

const isProductionBuild = process.env.NEXT_PHASE === 'phase-production-build';
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

// Next.js evaluates the auth module while generating the production build.
// The real secret must only exist in Vercel Environment Variables at runtime.
// This build-only value prevents the compiler from failing before deployment.
const buildCookieSecret = 'flowcash-build-only-cookie-secret-2026-never-use-at-runtime-64';

export const auth = createNeonAuth({
  baseUrl:
    process.env.NEON_AUTH_BASE_URL ||
    'https://ep-lively-truth-aee04hj0.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth',
  cookies: {
    secret: cookieSecret || (isProductionBuild ? buildCookieSecret : undefined),
  },
});
