import type { Request } from '@playwright/test'

// The app reads and changes the account's data through the backend's REST paths (src/core/api.ts,
// server/internal/web), so a test that holds or answers one of them picks it by its method and path.

/** The method and path of a request, such as "PUT /api/shares". */
export function endpointOf(request: Request): string {
  return `${request.method()} ${new URL(request.url()).pathname}`
}

/** Matches every request to the backend's REST paths. */
export const API = /\/api\//

/** The answer of a request refused with the error key and status. */
export function apiError(key: string, status: number) {
  return { status, json: { error: key } }
}
