import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './lib/sentry'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({
    ...sentryOptions,
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  })
}
