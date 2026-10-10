import * as Sentry from '@sentry/nextjs'
import type { ErrorKey } from '@/core/appError'
import { tokenStore } from '@/plugins/storage/cloud/database'
import { sameOrigin, sessionOwner } from '../../_lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const failure = (error: ErrorKey, status: number) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return failure('forbiddenRequest', 403)
  try {
    const owner = await sessionOwner()
    if (!owner) return failure('loginRequired', 401)
    const { id } = await params
    // Another account's token reads the same as a missing one.
    if (!await tokenStore().revoke(owner, id)) return failure('tokenNotFound', 404)
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'tokens.revoke' } })
    return failure('databaseUnavailable', 503)
  }
}
