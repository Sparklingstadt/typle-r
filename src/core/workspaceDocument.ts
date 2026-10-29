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

const MAX_NAME = 200

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

/** `packs` missing or null means none are saved, as for an account that has saved nothing. */
export function decodeDocument(value: { lists: unknown; packs?: unknown; devices: unknown; interests?: unknown }): WorkspaceDocument {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: value.lists }))
  const devices = decodeDevices(value.devices ?? [])
  const interests = decodeInterests(value.interests)
  const packs = value.packs === undefined || value.packs === null ? null : decodePacks(value.packs)
  return { ...normalizeLibrary(lists, packs), devices, interests }
}

/** Lists saved before the limit may be more than MAX_LISTS; a change may keep or lower that number, never raise it. */
export function applyChange(document: WorkspaceDocument, change: WorkspaceChange): WorkspaceDocument {
  if (change.lists && change.lists.length > MAX_LISTS && change.lists.length > document.lists.length) {
    throw new AppError('listLimit', { max: MAX_LISTS })
  }
  // Lists sent without packs are each put in a pack of their own, as the account's save does (store.WriteRevision).
  const packs = change.packs ?? (change.lists ? [] : document.packs)
  const library = repairLibrary({ lists: change.lists ?? document.lists, packs })
  return { ...library, devices: change.devices ?? document.devices, interests: change.interests ?? document.interests }
}
