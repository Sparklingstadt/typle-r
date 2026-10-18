import { decodeDevices } from './devices'
import { decodeLists, type SavedWordList } from './wordLists'
import { LEGACY_PROFILE_ID, type WorkspaceChange } from './workspaceDocument'

export const MAX_WORKSPACE_BYTES = 1024 * 1024

/** A save from a screen of the app before profiles were removed, for a profile other than the first or changing the
 * profiles. It answers 409, so that screen reloads and shows the merged lists instead of overwriting them. */
export class LegacyProfileRequest extends Error {}

// The number of lists is checked against the saved ones when the change is applied (see `applyChange`).
export function validateLists(value: unknown): SavedWordList[] {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: value }))
  if (lists.some(list => list.words.length > 1000 || list.records.length > 10000 || list.name.length > 200 ||
    list.words.some(word => word.input.length > 1000 || word.display.length > 1000 || word.annotation.length > 2000))) {
    throw new Error('Workspace too large')
  }
  return lists
}

export function validateWorkspaceRequest(value: unknown): WorkspaceChange & { revision: number } {
  if (!value || typeof value !== 'object') throw new Error('Invalid request')
  const body = value as Record<string, unknown>
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error('Invalid revision')
  if ((body.profileId !== undefined && body.profileId !== LEGACY_PROFILE_ID) || body.profiles !== undefined) throw new LegacyProfileRequest()
  return { revision: Number(body.revision),
    ...(body.lists === undefined ? {} : { lists: validateLists(body.lists) }),
    ...(body.devices === undefined ? {} : { devices: decodeDevices(body.devices) }) }
}
