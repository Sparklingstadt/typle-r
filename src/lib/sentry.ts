import type { ErrorEvent } from '@sentry/nextjs'

// Workspace payloads and auth headers must never accompany error reports.
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  delete event.user
  delete event.extra
  delete event.breadcrumbs
  if (event.request) {
    const { method, url } = event.request
    event.request = { method, url: url?.split(/[?#]/)[0] }
  }
  return event
}

export const sentryOptions = {
  sendDefaultPii: false,
  tracesSampleRate: 0,
  maxBreadcrumbs: 0,
  beforeSend: sanitizeSentryEvent,
}
