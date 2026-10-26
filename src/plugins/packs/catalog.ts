import { AppError } from '../../core/appError'
import { addPackFile, packFileOf, type NewPackIds } from '../../core/packFile'
import { settle } from '../../core/packEditing'
import type { SavedWordList } from '../../core/wordLists'
import type { Library, WordPack } from '../../core/wordPacks'
import { initialLibrary } from '.'

// The official packs are the packs an account starts with (src/core may not read plugins, so the catalog lives here).
export type OfficialPack = { catalogId: string; version: number; pack: WordPack; lists: SavedWordList[] }
/** `added` when the library has a pack from this entry: one with its origin, or one with its id (accounts made before
 * origins existed got the initial packs under these ids, without an origin). */
export type CatalogEntry = OfficialPack & { added: boolean }

export function officialPacks(): OfficialPack[] {
  return initialLibrary.packs.map(pack => ({
    catalogId: pack.origin!.catalogId, version: pack.origin!.version, pack,
    lists: initialLibrary.lists.filter(list => list.packId === pack.id),
  }))
}

export function catalogEntries(library: Library): CatalogEntry[] {
  return officialPacks().map(entry => ({
    ...entry, added: library.packs.some(pack => pack.origin?.catalogId === entry.catalogId || pack.id === entry.catalogId),
  }))
}

/** Adds a copy of an official pack at the end, with its origin and without records. The name gets （2）… when taken. */
export function addOfficialPack(library: Library, catalogId: string, ids: NewPackIds, now = new Date()): Library {
  const entry = officialPacks().find(item => item.catalogId === catalogId)
  if (!entry) throw new AppError('packDeleted')
  const file = packFileOf(initialLibrary, entry.pack.id)
  return settle(addPackFile(library, file, ids, now, { catalogId: entry.catalogId, version: entry.version }))
}
