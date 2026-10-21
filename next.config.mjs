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

/** @type {import('next').NextConfig} */
const nextConfig = (phase) => withNextIntl({
  // Keep local development and verification separate; Vercel expects .next.
  distDir: phase === 'phase-development-server' || process.env.VERCEL === '1' ? '.next' : '.next-production',
  headers: () => [{ source: '/:path*', headers: securityHeaders }],
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
