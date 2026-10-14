import { AppError, type ErrorKey } from '@/core/appError'
import { decodeTokenSummaries, MAX_TOKENS, type TokenRequest, type TokenSummary } from '@/core/apiTokens'

// Calls /api/tokens with the session cookie. A failure rejects with the AppError the server names in `error`.
async function request(url: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try { response = await fetch(url, { cache: 'no-store', ...init }) }
  catch { throw new AppError('workspaceRequestFailed') }
  if (response.ok) return response
  const body: unknown = await response.json().catch(() => null)
  const key = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
  throw new AppError(typeof key === 'string' ? key as ErrorKey : 'workspaceRequestFailed', key === 'tokenLimit' ? { max: MAX_TOKENS } : {})
}

export async function listTokens(): Promise<TokenSummary[]> {
  const data: unknown = await (await request('/api/tokens')).json().catch(() => null)
  return decodeTokenSummaries(data && typeof data === 'object' ? (data as { tokens?: unknown }).tokens : undefined)
}

/** The secret is returned only here; the server keeps just its hash. */
export async function createToken(body: TokenRequest): Promise<{ token: TokenSummary; secret: string }> {
  const response = await request('/api/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data: unknown = await response.json().catch(() => null)
  const { token, secret } = (data && typeof data === 'object' ? data : {}) as { token?: unknown; secret?: unknown }
  const [summary] = decodeTokenSummaries([token])
  if (typeof secret !== 'string') throw new AppError('invalidServerData')
  return { token: summary, secret }
}

export async function revokeToken(id: string): Promise<void> {
  await request(`/api/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
