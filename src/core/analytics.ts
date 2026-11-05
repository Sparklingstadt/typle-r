// What a page view sends to Vercel Web Analytics.
// Kept free of Next.js and the analytics package so the rules can be unit-tested.

// Screens that only the developer or the administrator opens: counting them would only measure ourselves.
export const UNTRACKED_PATHS: readonly string[] = ['/admin', '/local-login']

// Keeps only the origin and the path. Query strings and fragments are dropped:
// they hold list IDs, filters and other per-person state that the counts do not need.
// Returns null for an untracked screen or a URL that cannot be read, so nothing is sent.
export function analyticsUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const path = parsed.pathname
  if (UNTRACKED_PATHS.some(blocked => path === blocked || path.startsWith(`${blocked}/`))) return null
  return `${parsed.origin}${path}`
}
