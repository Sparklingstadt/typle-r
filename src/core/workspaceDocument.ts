import { AppError } from './appError'
import { decodeDevices, type PracticeDevice } from './devices'
import { decodeInterests } from './interests'
import { MAX_LISTS } from './listOverview'
import { decodeLists, type SavedWordList } from './wordLists'
import { decodePacks, normalizeLibrary, repairLibrary, type Library, type WordPack } from './wordPacks'

/** `lists` are in the saved shape: each has a packId and no group, category or tags. */
export type WorkspaceDocument = Library & { devices: PracticeDevice[]; interests: string[] }
/** Omitted parts stay as they are. */
export type WorkspaceChange = { lists?: SavedWordList[]; packs?: WordPack[]; devices?: PracticeDevice[]; interests?: string[] }

// Workspaces could once hold several profiles, each with its own lists. The first profile's lists were always in
// `lists` and the others in `profiles`; reading such data moves the others' lists after the first one's. Accounts were
// merged by migration 0006_merge_profiles, which follows the same rules; a guest's data is merged when next read.
/** The first profile's id, which the app with profiles names in every save. */
export const LEGACY_PROFILE_ID = 'default'
const MAX_NAME = 200

/** `legacy` is false when the stored data has no removed profiles to merge. */
export type DecodedDocument = WorkspaceDocument & { legacy: boolean }

type LegacyProfile = { id: string; name: string; lists: SavedWordList[] }

function decodeLegacyProfiles(value: unknown): LegacyProfile[] {
  if (!Array.isArray(value)) throw new AppError('savedDataCorrupted')
  return value.slice(1).map(profile => {
    if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string') throw new AppError('savedDataCorrupted')
    return { id: profile.id, name: profile.name.trim(), lists: decodeLists(JSON.stringify({ version: 1, lists: profile.lists ?? [] })) }
  })
}

export function unique(taken: Set<string>, wanted: string, variant: (count: number) => string) {
  let value = wanted
  for (let count = 2; taken.has(value.toLocaleLowerCase()); count++) value = variant(count)
  taken.add(value.toLocaleLowerCase())
  return value
}

export function fit(name: string, suffix: string, limit = MAX_NAME) {
  const cut = name.slice(0, limit - suffix.length)
  // A character of two code units is not split, which would leave a string that cannot be saved.
  return (/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut).trimEnd() + suffix
}

/** Puts the lists of removed profiles after the first one's. A name already in use gets the profile's name after it. */
export function mergeProfiles(lists: SavedWordList[], profiles: LegacyProfile[]): SavedWordList[] {
  const ids = new Set(lists.map(list => list.id.toLocaleLowerCase()))
  const names = new Set(lists.map(list => list.name.trim().toLocaleLowerCase()))
  const merged = [...lists]
  for (const profile of profiles) {
    for (const list of profile.lists) {
      const id = unique(ids, list.id, count => `${profile.id}-${list.id}${count > 2 ? `-${count - 1}` : ''}`)
      const name = unique(names, list.name.trim(), count => fit(list.name.trim(), count === 2 ? `（${profile.name}）` : `（${profile.name} ${count - 1}）`))
      merged.push({ ...list, id, name })
    }
  }
  return merged
}

/** `packs` missing or null means the data was saved before packs existed. */
export function decodeDocument(value: { lists: unknown; packs?: unknown; devices: unknown; interests?: unknown; profiles?: unknown }): DecodedDocument {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: value.lists }))
  const devices = decodeDevices(value.devices ?? [])
  const interests = decodeInterests(value.interests)
  const profiles = decodeLegacyProfiles(value.profiles ?? [])
  // An empty array, or only the first profile, means there is nothing to merge.
  const legacy = Array.isArray(value.profiles) && value.profiles.length > 0
  const packs = value.packs === undefined || value.packs === null ? null : decodePacks(value.packs)
  return { ...normalizeLibrary(mergeProfiles(lists, profiles), packs), devices, interests, legacy }
}

/** Lists merged from removed profiles may be more than MAX_LISTS; a change may keep or lower that number, never raise it. */
export function applyChange(document: WorkspaceDocument, change: WorkspaceChange): WorkspaceDocument {
  if (change.lists && change.lists.length > MAX_LISTS && change.lists.length > document.lists.length) {
    throw new AppError('listLimit', { max: MAX_LISTS })
  }
  // A save from a screen that does not know packs has lists only; the saved packs stay and repair settles the rest.
  const library = repairLibrary({ lists: change.lists ?? document.lists, packs: change.packs ?? document.packs })
  return { ...library, devices: change.devices ?? document.devices, interests: change.interests ?? document.interests }
}
