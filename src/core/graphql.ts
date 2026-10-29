import { AppError } from './appError'

/** The path of the backend's GraphQL API (server/internal/web/graphql.go). */
export const GRAPHQL_PATH = '/api/graphql'

/**
 * A refused GraphQL request. `key` is the backend's error key and `status` the HTTP status its REST path answers with,
 * as the backend puts them in the error's `extensions`; a request refused before it is run (such as one too large)
 * is answered as REST answers it, with the key in `error` and its own status. `key` is undefined for an error the
 * backend did not name, such as a query it does not know.
 */
export class GraphQLError extends Error {
  constructor(readonly key: string | undefined, readonly status: number) {
    super(`GraphQL request failed: ${key ?? status}`)
  }
}

type GraphQLBody = {
  data?: unknown
  errors?: { extensions?: { code?: unknown; status?: unknown } }[]
  error?: unknown
}

/**
 * Runs a query or mutation on the backend and resolves with its `data`. The first error, if any, rejects with a
 * `GraphQLError`; a body that is not a GraphQL answer rejects with `invalidServerData`.
 */
export async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_PATH, {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }),
  })
  const body = await response.json().catch(() => null) as GraphQLBody | null
  const error = Array.isArray(body?.errors) ? body.errors[0] : undefined
  if (error) {
    const { code, status } = error.extensions ?? {}
    throw new GraphQLError(typeof code === 'string' ? code : undefined, typeof status === 'number' ? status : response.status)
  }
  if (!response.ok) throw new GraphQLError(typeof body?.error === 'string' ? body.error : undefined, response.status)
  if (!body || typeof body.data !== 'object' || body.data === null) throw new AppError('invalidServerData')
  return body.data as T
}
