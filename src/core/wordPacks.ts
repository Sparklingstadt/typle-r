import { AppError } from './appError'
import { MAX_LIST_NAME } from './listOverview'
import { MAX_CATEGORY, MAX_LEVEL, MAX_LEVELS, MAX_TAG, MAX_TAGS, normalizeLabels, type SavedWordList } from './wordLists'
import { fit, unique } from './workspaceDocument'

export const MAX_PACK_NAME = 200
export const MAX_PACK_DESCRIPTION = 500

export type WordPack = {
  id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  /** Set when the pack was added from the official catalog. */
  origin?: { catalogId: string; version: number }
  createdAt: string
}

/** The saved shape: lists have a packId and no group, category or tags. */
export type Library = { packs: WordPack[]; lists: SavedWordList[] }

const isString = (value: unknown): value is string => typeof value === 'string'
export const nameKey = (name: string) => name.trim().toLocaleLowerCase()
const numbered = (name: string) => (count: number) => fit(name, `（${count}）`)

// The levels the practice screen picks a list of a pack by: its levels, or its name when it has none.
export const levelPath = (list: Pick<SavedWordList, 'name' | 'levels'>) => list.levels?.length ? list.levels : [list.name]

// Two lists of a pack whose paths are equal, or one the start of the other, leave one of them out of reach on the
// practice screen: picking the shorter path picks its list, or asks for a further level, but never both.
// Since v0.97.0 a path has one step (a list has one level at most), so paths overlap only when they are equal; the
// general check stays for data before that is repaired.
export function pathsOverlap(a: string[], b: string[]) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.every((level, n) => level === long[n])
}

// A level without the spaces and ・ at its ends, which joining or cutting would leave as ・・ or a trailing ・.
const bare = (level: string) => level.replace(/^[\s・]+|[\s・]+$/g, '')

/**
 * A list holds one level at most since v0.97.0. Several levels saved by an older app become one: the levels without
 * spaces and ・ at their ends (bare), without empty ones, joined with ・ as levelName shows them, cut to MAX_LEVEL and
 * made bare again; no level at all when none is left.
 */
export function collapseLevels(list: SavedWordList): SavedWordList {
  if ((list.levels?.length ?? 0) <= 1) return list
  const { levels, ...rest } = list
  const joined = joinLevels(levels!)
  return joined ? { ...list, levels: [joined] } : rest
}

/** Several levels as collapseLevels joins them into one, or undefined when none is left. */
export function joinLevels(levels: string[]) {
  return bare(fit(levels.map(bare).filter(Boolean).join('・'), '', MAX_LEVEL)) || undefined
}

/** The level a list of a pack file gets when it is imported (trimLevels, then collapseLevels), or undefined. */
export function importedLevel(levels: string[] | undefined) {
  const kept = (levels ?? []).map(level => level.trim()).filter(Boolean)
  return kept.length > 1 ? joinLevels(kept) : kept[0]
}

/**
 * Brings back in reach the lists an older app let overlap (see pathsOverlap): a list whose path equals that of an
 * earlier list of its pack gets （2）, （3）… on its level, or on its name when it has no levels (a name another list of
 * the pack does not use). Several levels of a list are joined into one first (collapseLevels). Earlier lists, and data
 * without overlaps, stay as they are.
 */
export function separateLevels(library: Library): Library {
  const lists = library.lists.map(collapseLevels)
  const names = new Map<string, Set<string>>()
  for (const list of lists) (names.get(list.packId!) ?? names.set(list.packId!, new Set()).get(list.packId!)!).add(nameKey(list.name))
  const accepted = new Map<string, string[][]>()
  return { ...library, lists: lists.map(list => {
    const paths = accepted.get(list.packId!) ?? accepted.set(list.packId!, []).get(list.packId!)!
    const taken = names.get(list.packId!)!
    const hasLevels = Boolean(list.levels?.length)
    const base = levelPath(list)
    const path = [...base]
    const nameTaken = () => !hasLevels && nameKey(path[0]) !== nameKey(list.name) && taken.has(nameKey(path[0]))
    for (let count = 2; paths.some(q => pathsOverlap(q, path)) || nameTaken(); count++) {
      path[0] = fit(base[0], `（${count}）`, hasLevels ? MAX_LEVEL : MAX_LIST_NAME)
    }
    paths.push(path)
    if (path[0] === base[0]) return list
    if (hasLevels) return { ...list, levels: path }
    taken.add(nameKey(path[0]))
    return { ...list, name: path[0] }
  }) }
}

/** Reads saved packs, keeping fields Typle does not know. */
export function decodePacks(value: unknown): WordPack[] {
  if (!Array.isArray(value)) throw new AppError('savedDataCorrupted')
  const ids = new Set<string>()
  for (const pack of value) {
    const origin = pack?.origin
    if (!pack || typeof pack !== 'object' || !isString(pack.id) || !pack.id || ids.has(pack.id) || !isString(pack.name) ||
        !isString(pack.createdAt) ||
        (pack.description !== undefined && !isString(pack.description)) ||
        (pack.category !== undefined && !isString(pack.category)) ||
        (pack.tags !== undefined && (!Array.isArray(pack.tags) || pack.tags.some((tag: unknown) => !isString(tag)))) ||
        (origin !== undefined && (!origin || !isString(origin.catalogId) || typeof origin.version !== 'number'))) {
      throw new AppError('savedDataCorrupted')
    }
    ids.add(pack.id)
  }
  return value
}

const withoutLabels = ({ group: _group, category: _category, tags: _tags, ...rest }: SavedWordList): SavedWordList => rest

// A group's tags may add up to more than a pack can hold; the first ones stay.
function labelsOf(category: string | undefined, tags: string[]) {
  const labels = normalizeLabels({ category, tags })
  return labels.tags ? { ...labels, tags: labels.tags.slice(0, MAX_TAGS) } : labels
}

/** Turns lists saved before packs existed into packs: one per group, one for each list without a group. */
export function convertLibrary(lists: SavedWordList[]): Library {
  const packs: WordPack[] = []
  const packOf = new Map<string, WordPack>()
  const names = new Set<string>()
  const packIds = lists.map(list => {
    const group = list.group?.trim()
    const key = group ? `group:${group}` : `list:${list.id}`
    const found = packOf.get(key)
    if (found) return found.id
    const members = group ? lists.filter(item => item.group?.trim() === group) : [list]
    const oldest = members.reduce((a, b) => Date.parse(b.createdAt) < Date.parse(a.createdAt) ? b : a)
    const wanted = group || list.name.trim()
    const pack: WordPack = {
      id: `pack-${list.id}`,
      name: unique(names, wanted, numbered(wanted)),
      ...labelsOf(list.category, members.flatMap(item => item.tags ?? [])),
      createdAt: oldest.createdAt,
    }
    packOf.set(key, pack)
    packs.push(pack)
    return pack.id
  })
  return separateLevels({ packs, lists: lists.map((list, index) => ({ ...withoutLabels(list), packId: packIds[index] })) })
}

/** Keeps the rules of ownership for data an older app saved: every list in one pack, no empty packs, no repeated names. */
export function repairLibrary(library: Library): Library {
  const packs = library.packs.map(pack => ({ ...pack }))
  const byId = new Map(packs.map(pack => [pack.id, pack]))
  // A list without a valid pack gets one of its own, or joins the one a former conversion made for it.
  const placed = library.lists.map(list => {
    if (list.packId !== undefined && byId.has(list.packId)) return list
    const id = `pack-${list.id}`
    if (!byId.has(id)) {
      const pack: WordPack = { id, name: list.name.trim(), createdAt: list.createdAt }
      byId.set(id, pack)
      packs.push(pack)
    }
    return { ...list, packId: id }
  })
  // Labels an older app left on a list move to the pack only while the pack has none.
  const lists = placed.map(list => {
    const pack = byId.get(list.packId!)!
    if (!pack.category && !pack.tags?.length) Object.assign(pack, normalizeLabels(list))
    return withoutLabels(list)
  })
  const used = new Set(lists.map(list => list.packId))
  const names = new Set<string>()
  const kept = packs.filter(pack => used.has(pack.id)).map(pack => ({ ...pack, name: unique(names, pack.name.trim(), numbered(pack.name.trim())) }))
  const listNames = new Map<string, Set<string>>()
  return separateLevels({ packs: kept, lists: lists.map(list => {
    const taken = listNames.get(list.packId!) ?? listNames.set(list.packId!, new Set()).get(list.packId!)!
    return { ...list, name: unique(taken, list.name.trim(), numbered(list.name.trim())) }
  }) })
}

/** `packs` is null for data saved before packs existed. */
export function normalizeLibrary(lists: SavedWordList[], packs: WordPack[] | null): Library {
  return packs === null ? convertLibrary(lists) : repairLibrary({ packs, lists })
}

/**
 * Refuses a library that is not in the saved shape, with a list of more than one level (tooManyLevels), or with lists
 * out of reach on the practice screen (levelsConflict).
 */
export function validateLibrary({ packs, lists }: Library) {
  const invalid = () => new Error('Invalid packs')
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const pack of packs) {
    const name = nameKey(pack.name)
    if (!pack.id || ids.has(pack.id) || !name || pack.name.length > MAX_PACK_NAME || names.has(name) ||
        (pack.description?.length ?? 0) > MAX_PACK_DESCRIPTION || (pack.category?.length ?? 0) > MAX_CATEGORY ||
        (pack.tags?.length ?? 0) > MAX_TAGS || pack.tags?.some(tag => tag.length > MAX_TAG)) {
      throw invalid()
    }
    ids.add(pack.id)
    names.add(name)
  }
  const listNames = new Map<string, Set<string>>()
  for (const list of lists) {
    const taken = listNames.get(list.packId ?? '') ?? listNames.set(list.packId ?? '', new Set()).get(list.packId ?? '')!
    const name = nameKey(list.name)
    if (!list.packId || !ids.has(list.packId) || taken.has(name) ||
        list.group !== undefined || list.category !== undefined || list.tags !== undefined) {
      throw invalid()
    }
    taken.add(name)
  }
  if (ids.size !== listNames.size) throw invalid()
  // Lists of a pack whose paths overlap, or with more than one level, are refused as packEditing refuses them;
  // separateLevels repairs saved ones.
  const paths = new Map<string, string[][]>()
  for (const list of lists) {
    if ((list.levels?.length ?? 0) > MAX_LEVELS) throw new AppError('tooManyLevels')
    const mine = paths.get(list.packId!) ?? paths.set(list.packId!, []).get(list.packId!)!
    if (mine.some(path => pathsOverlap(path, levelPath(list)))) throw new AppError('levelsConflict')
    mine.push(levelPath(list))
  }
}

/**
 * What screens see: each list carries its pack's category and tags, and a group (the pack name) when the pack holds two
 * or more lists or the list has levels (so a list with levels alone in its group still shows "group › level").
 */
export function viewLists({ packs, lists }: Library): SavedWordList[] {
  const byId = new Map(packs.map(pack => [pack.id, pack]))
  const counts = new Map<string, number>()
  for (const list of lists) counts.set(list.packId!, (counts.get(list.packId!) ?? 0) + 1)
  return lists.map(list => {
    const pack = byId.get(list.packId!)
    if (!pack) return { ...list }
    return {
      ...list,
      ...((counts.get(pack.id) ?? 0) >= 2 || list.levels !== undefined ? { group: pack.name } : {}),
      ...(pack.category ? { category: pack.category } : {}),
      ...(pack.tags ? { tags: [...pack.tags] } : {}),
    }
  })
}

/** Puts a change a screen made to the lists of `viewLists` back into the saved shape. */
export function applyListChange(previous: Library, lists: SavedWordList[]): Library {
  const before = new Map(previous.lists.map(list => [list.id, list]))
  const packs = previous.packs.map(pack => {
    const mine = lists.filter(list => list.packId === pack.id)
    // 1. The first list whose labels differ from the pack's gives the pack its new labels.
    const was = labelsOf(pack.category, pack.tags ?? [])
    const changed = mine.map(list => labelsOf(list.category, list.tags ?? []))
      .find(labels => JSON.stringify(labels) !== JSON.stringify(was))
    const { category: _category, tags: _tags, ...rest } = pack
    let next: WordPack = changed ? { ...rest, ...changed } : pack
    // 2. A pack of one list follows that list's rename.
    const only = previous.lists.filter(list => list.packId === pack.id)
    if (only.length === 1 && mine.length === 1 && mine[0].id === only[0].id && nameKey(pack.name) === nameKey(before.get(mine[0].id)!.name)) {
      next = { ...next, name: mine[0].name }
    }
    return next
  })
  // 3. Labels of lists in an existing pack were settled in 1, so they are dropped; only a list without a pack keeps them for repair to move.
  const known = new Set(packs.map(pack => pack.id))
  return repairLibrary({ packs, lists: lists.map(list => list.packId !== undefined && known.has(list.packId) ? withoutLabels(list) : list) })
}
