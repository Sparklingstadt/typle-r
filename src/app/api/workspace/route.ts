import { auth } from '@/auth'
import * as Sentry from '@sentry/nextjs'
import { database } from '@/lib/database'
import { MAX_WORKSPACE_BYTES, validateWorkspaceRequest } from '@/lib/workspaceRequest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
}

async function ownerId() {
  const session = await auth()
  const id = session?.user?.id
  return id && /^github:\d+$/.test(id) ? id : null
}

export async function GET() {
  try {
    const owner = await ownerId()
    if (!owner) return response({ error: 'ログインしてください。' }, 401)
    return response({ ...await database().read(owner), accountId: owner })
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'workspace.read' } })
    return response({ error: 'DBに接続できません。しばらくしてから再試行してください。' }, 503)
  }
}

export async function PUT(request: Request) {
  const expectedOrigin = new URL(process.env.AUTH_URL ?? request.url).origin
  if (request.headers.get('origin') !== expectedOrigin || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return response({ error: '許可されていないリクエストです。' }, 403)
  }
  try {
    const owner = await ownerId()
    if (!owner) return response({ error: 'ログインしてください。' }, 401)
    const reader = request.body?.getReader()
    if (!reader) return response({ error: 'データがありません。' }, 400)
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_WORKSPACE_BYTES) { await reader.cancel(); return response({ error: '保存データは1MB以内にしてください。' }, 413) }
      chunks.push(value)
    }
    let body
    try {
      const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (raw.accountId !== owner) return response({ error: 'ログインアカウントが変わりました。画面を開き直してください。' }, 401)
      body = validateWorkspaceRequest(raw)
    }
    catch { return response({ error: '保存データの形式やサイズを確認してください。' }, 400) }
    const result = await database().write(owner, body.lists, body.revision, body.devices)
    if (!result) return response({ error: '別の画面で更新されています。最新データを読み込んでから再試行してください。' }, 409)
    return response({ ...result, accountId: owner })
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'workspace.write' } })
    return response({ error: '保存できませんでした。入力内容を残したまま再試行できます。' }, 503)
  }
}
