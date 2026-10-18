import * as Sentry from '@sentry/nextjs'
import { AppError, type ErrorKey } from '@/core/appError'
import { allows, bearerSecret, type TokenScope } from '@/core/apiTokens'
import { MAX_WORKSPACE_BYTES } from '@/core/workspaceRequest'
import { tokenStore } from '@/plugins/storage/cloud/database'

const STATUS: Partial<Record<ErrorKey, number>> = {
  // What the request got wrong: thrown while reading it (here and in core/apiRequests) or by the list checks it shares
  // with the screen (core/wordLists).
  invalidJson: 400,
  invalidQuery: 400,
  invalidRecord: 400,
  invalidWorkspace: 400,
  deviceNotFound: 400,
  listLimit: 400,
  listNameRequired: 400,
  listNameDuplicate: 400,
  wordsRequired: 400,
  wordFieldsRequired: 400,
  listDeleted: 400,
  invalidToken: 401,
  insufficientScope: 403,
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

// RFC 6750 names the scheme a 401 expects.
function unauthorized() {
  const response = failure('invalidToken', 401)
  response.headers.set('WWW-Authenticate', 'Bearer')
  return response
}

export function apiRoute<P = Record<string, never>>(
  scope: TokenScope,
  operation: string,
  handle: (context: { owner: string; request: Request; params: P }) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const secret = bearerSecret(request.headers.get('authorization'))
      const token = secret ? await tokenStore().verify(secret) : null
      if (!token) return unauthorized()
      if (!allows(token.scope, scope)) return failure('insufficientScope', 403)
      return await handle({ owner: token.ownerId, request, params: await context.params })
    } catch (error) {
      const status = error instanceof AppError ? STATUS[error.key] : undefined
      if (error instanceof AppError && status) return failure(error.key, status)
      // Anything else, such as saved data that no longer decodes, is the server's fault.
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

export const apiOrigin = (request: Request) => new URL(process.env.AUTH_URL ?? request.url).origin
