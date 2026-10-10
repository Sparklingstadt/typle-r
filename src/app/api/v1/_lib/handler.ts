import * as Sentry from '@sentry/nextjs'
import { AppError, type ErrorKey } from '@/core/appError'
import { allows, bearerSecret, type TokenScope } from '@/core/apiTokens'
import { MAX_WORKSPACE_BYTES } from '@/core/workspaceRequest'
import { database, tokenStore } from '@/plugins/storage/cloud/database'
import type { Workspace } from '@/plugins/storage/cloud/repository'

const STATUS: Partial<Record<ErrorKey, number>> = {
  invalidToken: 401,
  insufficientScope: 403,
  profileNotFound: 404,
  listNotFound: 404,
  conflict: 409,
  tokenLimit: 409,
  workspaceTooLarge: 413,
  unsupportedContentType: 415,
}

// Responses are per token and may change at any moment, so nothing is cached. No CORS headers are sent on purpose.
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

const failure = (key: ErrorKey, status: number) => json({ error: key }, status)

export function apiRoute<P = Record<string, never>>(
  scope: TokenScope,
  operation: string,
  handle: (context: { owner: string; request: Request; params: P }) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const secret = bearerSecret(request.headers.get('authorization'))
      const token = secret ? await tokenStore().verify(secret) : null
      if (!token) return failure('invalidToken', 401)
      if (!allows(token.scope, scope)) return failure('insufficientScope', 403)
      return await handle({ owner: token.ownerId, request, params: await context.params })
    } catch (error) {
      if (error instanceof AppError) return failure(error.key, STATUS[error.key] ?? 400)
      Sentry.captureException(error, { tags: { operation } })
      return failure('databaseUnavailable', 503)
    }
  }
}

// Reads the body while counting, so an oversized one is refused without being held in memory.
export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AppError('unsupportedContentType')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = request.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_WORKSPACE_BYTES) { await reader.cancel(); throw new AppError('workspaceTooLarge') }
    chunks.push(value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new AppError('invalidJson') }
}

export async function requireProfile(owner: string, profileId: string): Promise<Workspace> {
  const workspace = await database().read(owner, profileId)
  // `read` falls back to the first profile for an unknown id; the API reports it instead.
  if (workspace.profileId !== profileId) throw new AppError('profileNotFound')
  return workspace
}

export const apiOrigin = (request: Request) => new URL(process.env.AUTH_URL ?? request.url).origin
