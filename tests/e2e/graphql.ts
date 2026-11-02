import type { Request } from '@playwright/test'

// The app reads and changes the account's data through POST /api/graphql (src/core/graphql.ts), one named operation
// per request, so a test that holds or answers one of them picks it by its operation name.

/** The URL pattern of the backend's GraphQL API. */
export const GRAPHQL = '**/api/graphql'

/** The name of the operation a request to /api/graphql runs, such as "Shares". */
export function operationOf(request: Request): string | undefined {
  const query = (request.postDataJSON() as { query?: unknown } | null)?.query
  return typeof query === 'string' ? /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1] : undefined
}

/** The answer of a field refused with the error key and the status its REST path answers with. */
export function graphqlError(key: string, status: number) {
  return { json: { data: null, errors: [{ message: key, extensions: { code: key, status } }] } }
}
