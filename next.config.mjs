import { withSentryConfig } from '@sentry/nextjs/config';
import createNextIntlPlugin from 'next-intl/plugin';

// Messages are chosen per request in src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Every response: no other site may frame the app (clickjacking of its buttons), and responses are not sniffed into
// another type or sent with the full URL as the referrer. form-action is left out: Chrome would also apply it to the
// redirect from the sign-in form to GitHub.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const typleWebUrl = (process.env.TYPLE_WEB_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = (phase) => withNextIntl({
  // Keep local development and verification separate; Vercel expects .next.
  distDir: phase === 'phase-development-server' || process.env.VERCEL === '1' ? '.next' : '.next-production',
  headers: () => [{ source: '/:path*', headers: securityHeaders }],
  // Locally the Go backend (npm run dev starts it) answers these paths; on Vercel the root api/*.go functions do.
  // beforeFiles wins over the app's own routes.
  rewrites: async () => process.env.VERCEL === '1' ? [] : {
    beforeFiles: ['/api/workspace', '/api/shares', '/api/shared', '/api/health', '/api/auth/:path*', '/api/admin/:path*'].map(source => ({ source, destination: `${typleWebUrl}${source}` })),
    afterFiles: [],
    fallback: [],
  },
});

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
});
