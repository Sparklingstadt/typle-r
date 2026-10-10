import * as Sentry from '@sentry/nextjs'
import { AppError, type ErrorKey } from '@/core/appError'
import { decodeTokenRequest } from '@/core/apiTokens'
import { tokenStore } from '@/plugins/storage/cloud/database'
import { sameOrigin, sessionOwner } from '../_lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The secret appears in the POST response, so nothing here may be cached or shared.
function response(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
}

const failure = (error: ErrorKey, status: number) => response({ error }, status)

// Token management is for the signed-in screen only; a Bearer token cannot reach it.
export async function GET() {
  try {
    const owner = await sessionOwner()
    if (!owner) return failure('loginRequired', 401)
    return response({ tokens: await tokenStore().list(owner) })
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'tokens.list' } })
    return failure('databaseUnavailable', 503)
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return failure('forbiddenRequest', 403)
  }
  try {
    const owner = await sessionOwner()
    if (!owner) return failure('loginRequired', 401)
    let tokenRequest
    try { tokenRequest = decodeTokenRequest(await request.json()) }
    catch { return failure('invalidTokenRequest', 400) }
    return response(await tokenStore().create(owner, tokenRequest), 201)
  } catch (error) {
    if (error instanceof AppError && error.key === 'tokenLimit') return failure('tokenLimit', 409)
    Sentry.captureException(error, { tags: { operation: 'tokens.create' } })
    return failure('databaseUnavailable', 503)
  }
}
