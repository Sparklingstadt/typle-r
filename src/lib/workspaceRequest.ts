import { decodeDevices } from './devices'
import { decodeLists } from './wordLists'

export const MAX_WORKSPACE_BYTES = 1024 * 1024

export function validateWorkspaceRequest(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid request')
  const body = value as Record<string, unknown>
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error('Invalid revision')
  const lists = decodeLists(JSON.stringify({ version: 1, lists: body.lists }))
  if (lists.length > 100 || lists.some(list => list.words.length > 1000 || list.records.length > 10000 || list.name.length > 200 ||
    list.words.some(word => word.input.length > 1000 || word.display.length > 1000 || word.annotation.length > 2000))) {
    throw new Error('Workspace too large')
  }
  return { lists, revision: Number(body.revision),
    ...(body.devices === undefined ? {} : { devices: decodeDevices(body.devices) }) }
}
