import { AppError } from './appError'
import { addPackFile, packFileOf, type NewPackIds } from './packFile'
import type { SavedWordList } from './wordLists'
import type { Library, WordPack } from './wordPacks'

/** An official pack as the catalog holds it, in the saved shape (its lists have the pack's id as packId and no records). */
export type OfficialPack = { catalogId: string; version: number; pack: WordPack; lists: SavedWordList[] }

export const isFollowed = (pack: Pick<WordPack, 'origin'>) => pack.origin?.followed === true

/** The packs a list can be put in: those that are not followed. */
export const ownPacks = <T extends Pick<WordPack, 'origin'>>(packs: T[]) => packs.filter(pack => !isFollowed(pack))

/**
 * Brings a library read from the saved data in line with the catalog, in two steps; applying it again changes nothing.
 * 1. Copies from before v0.98.0 are removed with their lists and records: a pack with an origin that is not followed,
 *    and a pack without an origin whose id is a catalogId.
 * 2. Each followed pack is made equal to its official pack (removed when the catalog has none), keeping its id, name,
 *    createdAt and the records of the lists it keeps.
 */
export function followOfficial(library: Library, official: OfficialPack[]): Library {
  const catalog = new Map(official.map(entry => [entry.catalogId, entry]))
  const kept = library.packs.filter(pack => {
    if (pack.origin) return pack.origin.followed === true && catalog.has(pack.origin.catalogId)
    return !catalog.has(pack.id)
  })
  const packs: WordPack[] = []
  const synced = new Map<string, SavedWordList[]>()
  for (const pack of kept) {
    if (!isFollowed(pack)) { packs.push(pack); continue }
    const official = catalog.get(pack.origin!.catalogId)!
    const { description: _description, category: _category, tags: _tags, ...rest } = pack
    const { description, category, tags } = official.pack
    packs.push({ ...rest, ...(description ? { description } : {}), ...(category ? { category } : {}), ...(tags?.length ? { tags: [...tags] } : {}) })
    const mine = library.lists.filter(list => list.packId === pack.id)
    synced.set(pack.id, official.lists.map(item => {
      const found = mine.find(list => list.origin?.listId === item.id)
      const { levels: _levels, ...rest } = found ?? { id: `${pack.id}:${item.id}`, packId: pack.id, records: [], createdAt: item.createdAt, origin: { listId: item.id } }
      return {
        ...(rest as SavedWordList), name: item.name, ...(item.levels?.length ? { levels: [...item.levels] } : {}),
        words: item.words.map(word => ({ ...word })),
      }
    }))
  }
  const byId = new Map(packs.map(pack => [pack.id, pack]))
  // A followed pack's lists go where its first list was.
  const placed = new Set<string>()
  const lists = library.lists.flatMap(list => {
    const pack = byId.get(list.packId!)
    if (!pack) return []
    if (!synced.has(pack.id)) return [list]
    if (placed.has(pack.id)) return []
    placed.add(pack.id)
    return synced.get(pack.id)!
  })
  return { packs, lists }
}

/**
 * Follows an official pack: it is added at the end as a followed pack (named （2）, （3）… when its name is taken), with
 * its lists in the official order, and the library is then made to follow the catalog.
 */
export function followPack(library: Library, official: OfficialPack[], catalogId: string, ids: NewPackIds, now = new Date()): Library {
  const entry = official.find(item => item.catalogId === catalogId)
  if (!entry) throw new AppError('packDeleted')
  const file = packFileOf({ packs: [entry.pack], lists: entry.lists }, entry.pack.id)
  const added = addPackFile(library, file, ids, now, { catalogId: entry.catalogId, version: entry.version, followed: true })
  // The new lists come last, in the order of the file, each tied to its official list.
  const first = added.lists.length - entry.lists.length
  return followOfficial({
    ...added,
    lists: added.lists.map((list, n) => n < first ? list : { ...list, origin: { listId: entry.lists[n - first].id } }),
  }, official)
}
