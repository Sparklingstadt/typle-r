import { sameOrigin, sessionOwner } from '../_lib/session'
import * as Sentry from '@sentry/nextjs'
import { database } from '@/plugins/storage/cloud/database'
import { AppError, type ErrorKey } from '@/core/appError'
import { LegacyProfileRequest, MAX_WORKSPACE_BYTES, validateWorkspaceRequest } from '@/core/workspaceRequest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
}

// Errors are keys of the `errors` messages; the client shows them in the reader's language.
const failure = (error: ErrorKey, status: number) => response({ error }, status)

// The app before profiles were removed may still ask for `?profile=<id>`. The answer has no `profiles`, which that
// app reads as a server with only the first profile, so it switches to it.
export async function GET() {
  try {
    const owner = await sessionOwner()
    if (!owner) return failure('loginRequired', 401)
    return response({ ...await database().read(owner), accountId: owner })
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'workspace.read' } })
    return failure('databaseUnavailable', 503)
  }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request) || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return failure('forbiddenRequest', 403)
  }
  try {
    const owner = await sessionOwner()
    if (!owner) return failure('loginRequired', 401)
    const reader = request.body?.getReader()
    if (!reader) return failure('emptyRequest', 400)
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_WORKSPACE_BYTES) { await reader.cancel(); return failure('workspaceTooLarge', 413) }
      chunks.push(value)
    }
    let body
    try {
      const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (raw.accountId !== owner) return failure('loginAccountChanged', 401)
      body = validateWorkspaceRequest(raw)
    }
    catch (error) { return error instanceof LegacyProfileRequest ? failure('conflict', 409) : failure('invalidWorkspace', 400) }
    const { revision, ...change } = body
    let result
    try { result = await database().write(owner, revision, change) }
    catch (error) {
      if (error instanceof AppError && error.key === 'listLimit') return failure(error.key, 400)
      throw error
    }
    if (!result) return failure('conflict', 409)
    return response({ ...result, accountId: owner })
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'workspace.write' } })
    return failure('workspaceSaveFailed', 503)
  }
}
