import { AppError } from './appError'
import { listOverviews, matchesQuery, MAX_LISTS, type ListOverview } from './listOverview'
import { MAX_LEVEL, MAX_LEVELS, normalizeLabels, validateList, type SavedWordList } from './wordLists'
import { nameKey, repairLibrary, validateLibrary, viewLists, type Library, type WordPack } from './wordPacks'

export type PackOverview = {
  pack: WordPack
  /** The lists inside, in the shape screens use, in saved order. */
  lists: ListOverview[]
  /** Place in `packs` (saved order). */
  position: number
  wordCount: number
  practiceCount: number
  practicedListCount: number
  lastPracticed: number | null
}

export function packOverviews(library: Library): PackOverview[] {
  const overviews = listOverviews(viewLists(library))
  return library.packs.map((pack, position) => {
    const lists = overviews.filter(item => item.list.packId === pack.id)
    const dates = lists.map(item => item.lastPracticed).filter((date): date is number => date !== null)
    return {
      pack, lists, position,
      wordCount: lists.reduce((sum, item) => sum + item.list.words.length, 0),
      practiceCount: lists.reduce((sum, item) => sum + item.practiceCount, 0),
      practicedListCount: lists.filter(item => item.practiceCount > 0).length,
      lastPracticed: dates.length ? Math.max(...dates) : null,
    }
  })
}

/** Finds by the pack name, category and tags, and the names and words of the lists inside, without case. */
export function matchesPackQuery(item: PackOverview, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  return !needle || item.pack.name.toLocaleLowerCase().includes(needle) || item.lists.some(({ list }) => matchesQuery(list, query))
}

/** The lists inside that the list name or a word found, so the screen can open the pack to show them. */
export function matchingListIds(item: PackOverview, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  return item.lists.filter(({ list }) => list.name.toLocaleLowerCase().includes(needle) ||
    list.words.some(word => word.display.toLocaleLowerCase().includes(needle) || word.input.toLocaleLowerCase().includes(needle)))
    .map(({ list }) => list.id)
}

export type PackInput = { name: string; description?: string; category?: string; tags?: string[] }

const invalid = () => new Error('Invalid packs')

// A pack as saved from the fields of a screen: trimmed, and without a description or labels when they are empty.
function packFields(library: Library, fields: PackInput, selfId?: string) {
  const name = fields.name.trim()
  if (!name) throw new AppError('packNameRequired')
  if (library.packs.some(pack => pack.id !== selfId && nameKey(pack.name) === nameKey(name))) throw new AppError('packNameDuplicate')
  const description = fields.description?.trim()
  return { name, ...(description ? { description } : {}), ...normalizeLabels(fields) }
}

// Levels as normalizeGroup keeps them: trimmed, without empty ones, and left out when none is left.
export function tidyLevels(levels: string[] | undefined) {
  const kept = (levels ?? []).map(level => level.trim()).filter(Boolean)
  if (kept.length > MAX_LEVELS || kept.some(level => level.length > MAX_LEVEL)) throw invalid()
  return kept.length ? { levels: kept } : {}
}

const requirePack = (library: Library, packId: string) => {
  const pack = library.packs.find(item => item.id === packId)
  if (!pack) throw new AppError('packDeleted')
  return pack
}

// Every function ends here: the result is repaired, then refused if it is still not a library that can be saved.
export function settle(library: Library) {
  const result = repairLibrary(library)
  validateLibrary(result)
  return result
}

export function createPack(library: Library, fields: PackInput, firstList: SavedWordList, packId: string, now = new Date()): Library {
  const saved = packFields(library, fields)
  if (library.lists.length >= MAX_LISTS) throw new AppError('listLimit', { max: MAX_LISTS })
  validateList(firstList)
  const { group: _group, category: _category, tags: _tags, levels, ...rest } = firstList
  const pack: WordPack = { id: packId, ...saved, createdAt: now.toISOString() }
  const created: SavedWordList = { ...rest, name: firstList.name.trim(), ...tidyLevels(levels), packId, records: [] }
  return settle({ packs: [...library.packs, pack], lists: [...library.lists, created] })
}

export function updatePack(library: Library, packId: string, fields: PackInput): Library {
  requirePack(library, packId)
  const saved = packFields(library, fields, packId)
  const packs = library.packs.map(pack => {
    if (pack.id !== packId) return pack
    const { name: _name, description: _description, category: _category, tags: _tags, ...rest } = pack
    return { ...rest, ...saved }
  })
  return settle({ packs, lists: library.lists })
}

/**
 * `listIds` is the pack's lists in the new order. It may be stale (another tab added or deleted a list):
 * ids the pack does not hold are dropped, and lists of the pack not given keep their saved order after the given ones.
 */
export function reorderPackLists(library: Library, packId: string, listIds: string[]): Library {
  requirePack(library, packId)
  const mine = library.lists.filter(list => list.packId === packId)
  const byId = new Map(mine.map(list => [list.id, list]))
  const given = [...new Set(listIds)].filter(id => byId.has(id))
  const order = [...given, ...mine.map(list => list.id).filter(id => !given.includes(id))]
  let next = 0
  return settle({ packs: library.packs, lists: library.lists.map(list => list.packId === packId ? byId.get(order[next++])! : list) })
}

export function deletePack(library: Library, packId: string): Library {
  requirePack(library, packId)
  return settle({ packs: library.packs.filter(pack => pack.id !== packId), lists: library.lists.filter(list => list.packId !== packId) })
}

/** Creates or edits a list in a pack; with no pack (`packId` null) the list gets a pack of its own, named after it. */
export function saveListInPack(library: Library,
  list: { id: string; name: string; words: SavedWordList['words']; levels?: string[]; createdAt: string },
  packId: string | null, editing: boolean): Library {
  if (packId !== null) requirePack(library, packId)
  const existing = library.lists.find(item => item.id === list.id)
  if (editing && !existing) throw new AppError('listDeleted')
  if (!editing && library.lists.length >= MAX_LISTS) throw new AppError('listLimit', { max: MAX_LISTS })
  const target = packId ?? newPackId(library, list.id)
  validateList({ ...list, records: [] }, packId === null ? [] : library.lists.filter(item => item.packId === packId && item.id !== list.id))
  const { levels, createdAt, ...fields } = list
  const { levels: _levels, ...kept } = editing ? existing! : { levels: undefined }
  const saved: SavedWordList = { records: [], ...kept, ...fields, createdAt: existing?.createdAt ?? createdAt, name: list.name.trim(), ...tidyLevels(levels), packId: target }
  const packs = packId === null ? [...library.packs, { id: target, name: saved.name, createdAt: saved.createdAt }] : library.packs
  const others = library.lists.filter(item => item.id !== list.id)
  if (packId !== null && others.some(item => item.packId === target && pathsOverlap(levelPath(item), levelPath(saved)))) throw new AppError('levelsConflict')
  if (!editing) return settle({ packs, lists: [...others, saved] })
  // Staying in the pack keeps the place; moving puts the list right after the last list of the pack it joins.
  if (existing!.packId === target) return settle({ packs, lists: library.lists.map(item => item.id === list.id ? saved : item) })
  const end = others.map(item => item.packId).lastIndexOf(target)
  return settle({ packs, lists: [...others.slice(0, end + 1), saved, ...others.slice(end + 1)] })
}

// The levels the practice screen picks a list of a pack by: its levels, or its name when it has none.
export const levelPath = (list: Pick<SavedWordList, 'name' | 'levels'>) => list.levels?.length ? list.levels : [list.name]

// Two lists of a pack whose paths are equal, or one the start of the other, leave one of them out of reach on the
// practice screen: picking the shorter path picks its list, or asks for a further level, but never both.
export function pathsOverlap(a: string[], b: string[]) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.every((level, n) => level === long[n])
}

function newPackId(library: Library, listId: string) {
  const taken = new Set(library.packs.map(pack => pack.id))
  let id = `pack-${listId}`
  for (let n = 2; taken.has(id); n++) id = `pack-${listId}-${n}`
  return id
}
