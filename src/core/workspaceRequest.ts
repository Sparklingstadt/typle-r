import { decodeDevices } from './devices'
import { MAX_LISTS } from './listOverview'
import { decodeProfileDrafts, DEFAULT_PROFILE_ID, type WorkspaceChange } from './profiles'
import { stripShareIds } from './sharedLists'
import { decodeLists, type SavedWordList } from './wordLists'

export const MAX_WORKSPACE_BYTES = 1024 * 1024

export function validateProfileId(value: unknown) {
  if (value === undefined || value === null || value === '') return DEFAULT_PROFILE_ID
  if (typeof value !== 'string' || !/^[\w-]{1,100}$/.test(value)) throw new Error('Invalid profile')
  return value
}

export function validateLists(value: unknown): SavedWordList[] {
  const lists = stripShareIds(decodeLists(JSON.stringify({ version: 1, lists: value })))
  if (lists.length > MAX_LISTS || lists.some(list => list.words.length > 1000 || list.records.length > 10000 || list.name.length > 200 ||
    list.words.some(word => word.input.length > 1000 || word.display.length > 1000 || word.annotation.length > 2000))) {
    throw new Error('Workspace too large')
  }
  return lists
}

// Requests from clients that predate profiles have no `profileId` and always change the first profile's lists.
export function validateWorkspaceRequest(value: unknown): WorkspaceChange & { revision: number } {
  if (!value || typeof value !== 'object') throw new Error('Invalid request')
  const body = value as Record<string, unknown>
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error('Invalid revision')
  const profileId = validateProfileId(body.profileId)
  const profiles = body.profiles === undefined ? undefined : decodeProfileDrafts(body.profiles)
  if (profiles && !profiles.some(profile => profile.id === profileId)) throw new Error('Invalid profile')
  return { revision: Number(body.revision), profileId,
    ...(body.lists === undefined ? {} : { lists: validateLists(body.lists) }),
    ...(body.devices === undefined ? {} : { devices: decodeDevices(body.devices) }),
    ...(profiles ? { profiles } : {}) }
}
