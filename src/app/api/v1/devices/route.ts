import { database } from '@/plugins/storage/cloud/database'
import { apiRoute, json } from '../_lib/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = apiRoute('read', 'api.devices', async ({ owner }) => {
  const { devices } = await database().read(owner)
  return json({ devices })
})
