import { randomUUID } from 'node:crypto'
import { createList, decodeNewList, listDetail, listSummary } from '@/core/apiRequests'
import { database } from '@/plugins/storage/cloud/database'
import { apiOrigin, apiRoute, json, readJson } from '../_lib/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = apiRoute('read', 'api.lists.list', async ({ owner }) => {
  const { lists } = await database().read(owner)
  return json({ lists: lists.map(listSummary) })
})

export const POST = apiRoute('write', 'api.lists.create', async ({ owner, request }) => {
  const input = decodeNewList(await readJson(request))
  const id = randomUUID()
  const { workspace } = await database().modify(owner, ({ lists }) =>
    ({ lists: createList(lists, input, id, new Date()).lists, result: null }))
  // Read back from the saved workspace, which is the one that knows a share link.
  const list = workspace.lists.find(item => item.id === id)!
  return json({ list: listDetail(list, apiOrigin(request)) }, 201)
})
