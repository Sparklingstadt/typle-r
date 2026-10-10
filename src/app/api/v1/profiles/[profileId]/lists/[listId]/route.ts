import { decodeListPatch, deleteList, findList, listDetail, updateList } from '@/core/apiRequests'
import { database } from '@/plugins/storage/cloud/database'
import { apiOrigin, apiRoute, json, readJson, requireProfile } from '../../../../_lib/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { profileId: string; listId: string }

export const GET = apiRoute<Params>('read', 'api.lists.get', async ({ owner, request, params }) => {
  const { lists } = await requireProfile(owner, params.profileId)
  return json({ list: listDetail(findList(lists, params.listId), apiOrigin(request)) })
})

export const PATCH = apiRoute<Params>('write', 'api.lists.update', async ({ owner, request, params }) => {
  const patch = decodeListPatch(await readJson(request))
  const { workspace } = await database().modify(owner, params.profileId, ({ lists }) =>
    ({ lists: updateList(lists, params.listId, patch).lists, result: null }))
  return json({ list: listDetail(findList(workspace.lists, params.listId), apiOrigin(request)) })
})

export const DELETE = apiRoute<Params>('write', 'api.lists.delete', async ({ owner, params }) => {
  await database().modify(owner, params.profileId, ({ lists }) => ({ lists: deleteList(lists, params.listId), result: null }))
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
})
