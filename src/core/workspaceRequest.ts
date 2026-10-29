import { decodeDevices } from './devices'
import { decodeInterests } from './interests'
import { decodeLists, MAX_CATEGORY, MAX_GROUP, MAX_LEVEL, MAX_SAVED_LEVELS, MAX_TAG, MAX_TAGS, type SavedWordList } from './wordLists'
import { decodePacks, validateLibrary } from './wordPacks'
import type { WorkspaceChange } from './workspaceDocument'

export const MAX_WORKSPACE_BYTES = 1024 * 1024

// The number of lists is checked against the saved ones when the change is applied (see `applyChange`). Lists sent
// without packs by an app before v0.97.0 may hold up to MAX_SAVED_LEVELS levels, which are joined when read; with packs,
// validateLibrary refuses more than one.
export function validateLists(value: unknown): SavedWordList[] {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: value }))
  if (lists.some(list => list.words.length > 1000 || list.records.length > 10000 || list.name.length > 200 ||
    (list.category?.length ?? 0) > MAX_CATEGORY || (list.tags?.length ?? 0) > MAX_TAGS || list.tags?.some(tag => tag.length > MAX_TAG) ||
    (list.group?.length ?? 0) > MAX_GROUP || (list.levels?.length ?? 0) > MAX_SAVED_LEVELS || list.levels?.some(level => level.length > MAX_LEVEL) ||
    list.words.some(word => word.input.length > 1000 || word.display.length > 1000 || word.annotation.length > 2000))) {
    throw new Error('Workspace too large')
  }
  return lists
}

export function validateWorkspaceRequest(value: unknown): WorkspaceChange & { revision: number } {
  if (!value || typeof value !== 'object') throw new Error('Invalid request')
  const body = value as Record<string, unknown>
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error('Invalid revision')
  // Saves of the app from when it had profiles are no longer taken.
  if (body.profileId !== undefined || body.profiles !== undefined) throw new Error('Invalid request')
  // Packs only make sense with the lists that belong to them.
  if (body.packs !== undefined && body.lists === undefined) throw new Error('Invalid request')
  const lists = body.lists === undefined ? undefined : validateLists(body.lists)
  const packs = body.packs === undefined ? undefined : decodePacks(body.packs)
  if (lists && packs) validateLibrary({ packs, lists })
  return { revision: Number(body.revision),
    ...(lists ? { lists } : {}),
    ...(packs ? { packs } : {}),
    ...(body.devices === undefined ? {} : { devices: decodeDevices(body.devices) }),
    ...(body.interests === undefined ? {} : { interests: decodeInterests(body.interests) }) }
}
