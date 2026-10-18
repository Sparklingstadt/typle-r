import { randomUUID } from 'node:crypto'
import { addApiRecord, decodeNewRecord, findList, selectRecords } from '@/core/apiRequests'
import { database } from '@/plugins/storage/cloud/database'
import { apiRoute, json, readJson } from '../../../_lib/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { listId: string }

export const GET = apiRoute<Params>('read', 'api.records.list', async ({ owner, request, params }) => {
  const { lists } = await database().read(owner)
  const list = findList(lists, params.listId)
  return json({ records: selectRecords(list, new URL(request.url).searchParams) })
})

export const POST = apiRoute<Params>('write', 'api.records.create', async ({ owner, request, params }) => {
  const input = decodeNewRecord(await readJson(request))
  const newId = randomUUID()
  const { result } = await database().modify(owner, ({ lists, devices }) => {
    const added = addApiRecord(lists, params.listId, input, devices, newId)
    return { lists: added.lists, result: { record: added.record, created: added.created } }
  })
  return json({ record: result.record }, result.created ? 201 : 200)
})
