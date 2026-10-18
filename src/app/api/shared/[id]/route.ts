import * as Sentry from '@sentry/nextjs'
import { database } from '@/plugins/storage/cloud/database'
import { isShareId } from '@/core/sharedLists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Turning sharing off must take effect at once, so nothing here is cached.
function response(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

// Public: anyone with the link may read the list's name and words. The owner and records are never sent.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isShareId(id)) return response({ error: 'sharedListNotFound' }, 404)
  try {
    const list = await database().readShared(id)
    return list ? response(list) : response({ error: 'sharedListNotFound' }, 404)
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'shared.read' } })
    return response({ error: 'databaseUnavailable' }, 503)
  }
}
