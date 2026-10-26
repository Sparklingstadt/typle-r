import { AppError } from './appError'
import { MAX_CATEGORY, MAX_TAG, MAX_TAGS, normalizeLabels, type SavedWordList } from './wordLists'
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
const nameKey = (name: string) => name.trim().toLocaleLowerCase()
const numbered = (name: string) => (count: number) => fit(name, `（${count}）`)

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
  return { packs, lists: lists.map((list, index) => ({ ...withoutLabels(list), packId: packIds[index] })) }
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
  return { packs: kept, lists: lists.map(list => {
    const taken = listNames.get(list.packId!) ?? listNames.set(list.packId!, new Set()).get(list.packId!)!
    return { ...list, name: unique(taken, list.name.trim(), numbered(list.name.trim())) }
  }) }
}

/** `packs` is null for data saved before packs existed. */
export function normalizeLibrary(lists: SavedWordList[], packs: WordPack[] | null): Library {
  return packs === null ? convertLibrary(lists) : repairLibrary({ packs, lists })
}

/** Refuses a library that is not in the saved shape. */
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
