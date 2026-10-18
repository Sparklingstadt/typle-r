import { AppError } from './appError'
import { decodeDevices, type PracticeDevice } from './devices'
import { MAX_LISTS } from './listOverview'
import { decodeLists, type SavedWordList } from './wordLists'

export type WorkspaceDocument = { lists: SavedWordList[]; devices: PracticeDevice[] }
/** Omitted parts stay as they are. */
export type WorkspaceChange = { lists?: SavedWordList[]; devices?: PracticeDevice[] }

// Workspaces could once hold several profiles, each with its own lists. The first profile's lists were always in the
// `lists` column and the others in `profiles`; reading such data moves the others' lists after the first one's.
// The id and name the share links of the stored data use; the column stays so the app before the removal keeps working.
export const LEGACY_PROFILE_ID = 'default'
const MAX_NAME = 200

/** A list moved out of a removed profile: its id there, and its id now (changed only when the first profile had it). */
export type MovedList = { profileId: string; listId: string; id: string }
/** `moved` is empty and `legacy` false when the stored data has no removed profiles to merge. */
export type DecodedDocument = WorkspaceDocument & { legacy: boolean; moved: MovedList[] }

type LegacyProfile = { id: string; name: string; lists: SavedWordList[] }

function decodeLegacyProfiles(value: unknown): LegacyProfile[] {
  if (!Array.isArray(value)) throw new AppError('savedDataCorrupted')
  return value.slice(1).map(profile => {
    if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string') throw new AppError('savedDataCorrupted')
    return { id: profile.id, name: profile.name.trim(), lists: decodeLists(JSON.stringify({ version: 1, lists: profile.lists ?? [] })) }
  })
}

function unique(taken: Set<string>, wanted: string, variant: (count: number) => string) {
  let value = wanted
  for (let count = 2; taken.has(value.toLocaleLowerCase()); count++) value = variant(count)
  taken.add(value.toLocaleLowerCase())
  return value
}

const fit = (name: string, suffix: string) => name.slice(0, MAX_NAME - suffix.length).trimEnd() + suffix

/** Puts the lists of removed profiles after the first one's. A name already in use gets the profile's name after it. */
export function mergeProfiles(lists: SavedWordList[], profiles: LegacyProfile[]): { lists: SavedWordList[]; moved: MovedList[] } {
  const ids = new Set(lists.map(list => list.id.toLocaleLowerCase()))
  const names = new Set(lists.map(list => list.name.trim().toLocaleLowerCase()))
  const merged = [...lists]
  const moved: MovedList[] = []
  for (const profile of profiles) {
    for (const list of profile.lists) {
      const id = unique(ids, list.id, count => `${profile.id}-${list.id}${count > 2 ? `-${count - 1}` : ''}`)
      const name = unique(names, list.name.trim(), count => fit(list.name.trim(), count === 2 ? `（${profile.name}）` : `（${profile.name} ${count - 1}）`))
      merged.push({ ...list, id, name })
      moved.push({ profileId: profile.id, listId: list.id, id })
    }
  }
  return { lists: merged, moved }
}

export function decodeDocument(value: { lists: unknown; devices: unknown; profiles?: unknown }): DecodedDocument {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: value.lists }))
  const devices = decodeDevices(value.devices ?? [])
  const profiles = decodeLegacyProfiles(value.profiles ?? [])
  // An empty array, or only the first profile, means there is nothing to merge.
  const legacy = Array.isArray(value.profiles) && value.profiles.length > 0
  return { ...mergeProfiles(lists, profiles), devices, legacy }
}

/** Lists merged from removed profiles may be more than MAX_LISTS; a change may keep or lower that number, never raise it. */
export function applyChange(document: WorkspaceDocument, change: WorkspaceChange): WorkspaceDocument {
  if (change.lists && change.lists.length > MAX_LISTS && change.lists.length > document.lists.length) {
    throw new AppError('listLimit', { max: MAX_LISTS })
  }
  return { lists: change.lists ?? document.lists, devices: change.devices ?? document.devices }
}
