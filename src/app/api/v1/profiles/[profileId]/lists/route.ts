import { randomUUID } from 'node:crypto'
import { createList, decodeNewList, listDetail, listSummary } from '@/core/apiRequests'
import { database } from '@/plugins/storage/cloud/database'
import { apiOrigin, apiRoute, json, readJson, requireProfile } from '../../../_lib/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { profileId: string }

export const GET = apiRoute<Params>('read', 'api.lists.list', async ({ owner, params }) => {
  const { lists } = await requireProfile(owner, params.profileId)
  return json({ lists: lists.map(listSummary) })
})

export const POST = apiRoute<Params>('write', 'api.lists.create', async ({ owner, request, params }) => {
  const input = decodeNewList(await readJson(request))
  const id = randomUUID()
  const { workspace } = await database().modify(owner, params.profileId, ({ lists }) =>
    ({ lists: createList(lists, input, id, new Date()).lists, result: null }))
  // Read back from the saved workspace, which is the one that knows a share link.
  const list = workspace.lists.find(item => item.id === id)!
  return json({ list: listDetail(list, apiOrigin(request)) }, 201)
})
