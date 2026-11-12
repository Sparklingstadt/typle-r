import { AppError } from './appError'

/**
 * A refused request to the backend's REST API (server/internal/web). `key` is the error key the backend answers with
 * (`{ "error": <key> }`), and `status` the HTTP status. `key` is undefined when the answer names none.
 */
export class ApiError extends Error {
  constructor(readonly key: string | undefined, readonly status: number) {
    super(`API request failed: ${key ?? status}`)
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Sent as JSON. */
  body?: unknown
  /** Lets the request finish after the page that sent it is left. */
  keepalive?: boolean
}

/**
 * Sends a request to the backend and resolves with the JSON it answers, or undefined for an answer without a body (204).
 * A refused request rejects with an `ApiError`; a successful answer that is not JSON rejects with `invalidServerData`.
 */
export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, keepalive } = options
  const response = await fetch(path, {
    method, cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    ...(keepalive ? { keepalive: true } : {}),
  })
  if (response.status === 204) {
    if (!response.ok) throw new ApiError(undefined, response.status)
    return undefined as T
  }
  const data = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    const key = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : undefined
    throw new ApiError(key, response.status)
  }
  if (data === undefined) throw new AppError('invalidServerData')
  return data as T
}

/** `path` with the query `params`. */
export function withQuery(path: string, params: Record<string, string | number>): string {
  const query = new URLSearchParams(Object.entries(params).map(([name, value]) => [name, String(value)]))
  return `${path}?${query}`
}
