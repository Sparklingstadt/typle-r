import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './lib/sentry'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({
    ...sentryOptions,
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
