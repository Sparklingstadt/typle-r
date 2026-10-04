import { auth } from '@/auth'
import * as Sentry from '@sentry/nextjs'
import { database } from '@/plugins/storage/cloud/database'
import type { ErrorKey } from '@/core/appError'
import { MissingProfileError } from '@/core/profiles'
import { MAX_WORKSPACE_BYTES, validateProfileId, validateWorkspaceRequest } from '@/core/workspaceRequest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
}

// Errors are keys of the `errors` messages; the client shows them in the reader's language.
const failure = (error: ErrorKey, status: number) => response({ error }, status)

async function ownerId() {
  const session = await auth()
  const id = session?.user?.id
  return id && /^github:\d+$/.test(id) ? id : null
}

// `?profile=<id>` picks whose word lists to return; an unknown id returns the first profile.
export async function GET(request: Request) {
  try {
    const owner = await ownerId()
    if (!owner) return failure('loginRequired', 401)
    let profileId
    try { profileId = validateProfileId(new URL(request.url).searchParams.get('profile')) }
    catch { return failure('invalidProfile', 400) }
    return response({ ...await database().read(owner, profileId), accountId: owner })
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'workspace.read' } })
    return failure('databaseUnavailable', 503)
  }
}

export async function PUT(request: Request) {
  const expectedOrigin = new URL(process.env.AUTH_URL ?? request.url).origin
  if (request.headers.get('origin') !== expectedOrigin || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return failure('forbiddenRequest', 403)
  }
  try {
    const owner = await ownerId()
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
    catch { return failure('invalidWorkspace', 400) }
    const { revision, ...change } = body
    let result
    try { result = await database().write(owner, revision, change) }
    catch (error) {
      if (error instanceof MissingProfileError) return failure(error.key, 409)
      throw error
    }
    if (!result) return failure('conflict', 409)
    return response({ ...result, accountId: owner })
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'workspace.write' } })
    return failure('workspaceSaveFailed', 503)
  }
}
