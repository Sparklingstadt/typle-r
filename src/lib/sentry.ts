import type { ErrorEvent } from '@sentry/nextjs'

// A shared link's id is the key to the pack, so reports name the route instead.
const withoutShareId = (path: string) => path.replace(/\/shared\/[^/?#]+/g, '/shared/[id]')

// Workspace payloads and auth headers must never accompany error reports.
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  delete event.user
  delete event.extra
  delete event.breadcrumbs
  if (event.request) {
    const { method, url } = event.request
    event.request = { method, url: url === undefined ? undefined : withoutShareId(url.split(/[?#]/)[0]) }
  }
  if (event.transaction) event.transaction = withoutShareId(event.transaction)
  return event
}

export const sentryOptions = {
  sendDefaultPii: false,
  tracesSampleRate: 0,
  maxBreadcrumbs: 0,
  beforeSend: sanitizeSentryEvent,
}
