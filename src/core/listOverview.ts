import { AppError } from './appError'
import { recordsOfMode } from './records'
import type { SavedWordList } from './wordLists'
import type { Library } from './wordPacks'

/** The lists an account may hold, not counting those of followed packs (see ownListCount). */
export const MAX_LISTS = 150
/** The official packs an account may follow. Their lists are saved without words, so MAX_LISTS does not count them. */
export const MAX_FOLLOWED_PACKS = 200
export const MAX_LIST_NAME = 200

const followedIds = (packs: Library['packs']) => new Set(packs.filter(pack => pack.origin?.followed === true).map(pack => pack.id))

/** The lists MAX_LISTS counts: those not in a followed pack, whose words the catalog has (ownListCount in Go). */
export function ownListCount({ packs, lists }: Pick<Library, 'packs' | 'lists'>) {
  const followed = followedIds(packs)
  return lists.filter(list => !followed.has(list.packId!)).length
}

export function followedPackCount(packs: Library['packs']) {
  return followedIds(packs).size
}

export type ListOverview = {
  list: SavedWordList
  /** Position in the saved order, which is the order the lists were added in. */
  position: number
  practiceCount: number
  lastPracticed: number | null
}

export type ListOrder = 'added' | 'practiced' | 'name' | 'words'
export const LIST_ORDERS: ListOrder[] = ['added', 'practiced', 'name', 'words']

export function listOverviews(lists: SavedWordList[]): ListOverview[] {
  return lists.map((list, position) => {
    const dates = list.records.map(record => Date.parse(record.date)).filter(Number.isFinite)
    return { list, position, practiceCount: list.records.length, lastPracticed: dates.length ? Math.max(...dates) : null }
  })
}

// Newest first for 'added'. Lists without a record come after the practised ones for 'practiced'.
export function sortOverviews(items: ListOverview[], order: ListOrder, locale = 'ja') {
  const collator = new Intl.Collator(locale, { numeric: true })
  return [...items].sort((a, b) => {
    if (order === 'name') return collator.compare(a.list.name, b.list.name) || b.position - a.position
    if (order === 'words') return b.list.words.length - a.list.words.length || b.position - a.position
    if (order === 'practiced') return (b.lastPracticed ?? -Infinity) - (a.lastPracticed ?? -Infinity) || b.position - a.position
    return b.position - a.position
  })
}

// Matches the list name, its group, category and tags, and the words, so a list can be found by one of its words.
export function matchesQuery(list: SavedWordList, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return true
  return list.name.toLocaleLowerCase().includes(needle) || !!list.group?.toLocaleLowerCase().includes(needle) ||
    !!list.category?.toLocaleLowerCase().includes(needle) ||
    !!list.tags?.some(tag => tag.toLocaleLowerCase().includes(needle)) ||
    list.words.some(word => word.display.toLocaleLowerCase().includes(needle) || word.input.toLocaleLowerCase().includes(needle))
}

/** Narrows lists down by category and tags. `category` null is every list and '' the lists without one; a list must
 * have every tag in `tags`. Both compare without case, as tags are kept unique without case. */
export type ListFilter = { category: string | null; tags: string[] }
export const NO_FILTER: ListFilter = { category: null, tags: [] }

export function isFiltered(filter: ListFilter) {
  return filter.category !== null || filter.tags.length > 0
}

export function matchesFilter(list: Pick<SavedWordList, 'category' | 'tags'>, filter: ListFilter) {
  const key = (value: string) => value.trim().toLocaleLowerCase()
  if (filter.category !== null && key(list.category ?? '') !== key(filter.category)) return false
  const tags = new Set((list.tags ?? []).map(key))
  return filter.tags.every(tag => tags.has(key(tag)))
}

/** The categories and tags in use, each once (in the spelling first seen) in name order, with how many lists have it.
 * `uncategorized` counts the lists without a category. */
export function listLabels(lists: Pick<SavedWordList, 'category' | 'tags'>[], locale = 'ja') {
  const count = (values: string[]) => {
    const found = new Map<string, { name: string; count: number }>()
    for (const value of values) {
      const name = value.trim()
      if (!name) continue
      const item = found.get(name.toLocaleLowerCase())
      if (item) item.count++
      else found.set(name.toLocaleLowerCase(), { name, count: 1 })
    }
    const collator = new Intl.Collator(locale, { numeric: true })
    return [...found.values()].sort((a, b) => collator.compare(a.name, b.name))
  }
  return {
    categories: count(lists.map(list => list.category ?? '')),
    tags: count(lists.flatMap(list => list.tags ?? [])),
    uncategorized: lists.filter(list => !list.category?.trim()).length,
  }
}

export type Labels = ReturnType<typeof listLabels>

/** A list's name in its group: its levels, such as 基本・初級, or its name when it has none. */
export function levelName(list: Pick<SavedWordList, 'name' | 'levels'>, separator = '・') {
  return list.levels?.length ? list.levels.join(separator) : list.name
}

/** The choices of each step of a group, in the order of its lists: step n offers the nth levels of the lists that match
 * the levels chosen before it. A list without levels is its own choice in the first step. `chosen` is the levels
 * picked so far. Since v0.97.0 a list has one level at most, so there is one step. */
export function levelSteps(lists: Pick<SavedWordList, 'name' | 'levels'>[], chosen: string[]) {
  const levelsOf = (list: Pick<SavedWordList, 'name' | 'levels'>) => list.levels?.length ? list.levels : [list.name]
  const steps: { options: string[]; chosen: string | null }[] = []
  for (let step = 0; ; step++) {
    const options = [...new Set(lists.map(levelsOf).filter(levels => levels.length > step && chosen.slice(0, step).every((level, n) => levels[n] === level))
      .map(levels => levels[step]))]
    if (!options.length) return steps
    const pick = options.includes(chosen[step]) ? chosen[step] : null
    steps.push({ options, chosen: pick })
    if (pick === null) return steps
  }
}

/** The list of a group whose levels are exactly `chosen`, if there is one. */
export function listAtLevels<T extends Pick<SavedWordList, 'name' | 'levels'>>(lists: T[], chosen: string[]) {
  return lists.find(list => {
    const levels = list.levels?.length ? list.levels : [list.name]
    return levels.length === chosen.length && levels.every((level, n) => level === chosen[n])
  })
}

// The first words of a list and how many more there are; the screen joins them in the reader's language.
export function wordPreview(list: SavedWordList, limit = 6) {
  return { words: list.words.slice(0, limit).map(word => word.display.trim()), rest: Math.max(0, list.words.length - limit) }
}

// The records a list's best is taken from: normal runs at its current word count (see comparableRecords).
export function currentRecordCount(list: Pick<SavedWordList, 'words' | 'records'>) {
  return recordsOfMode(list.records, 'normal').filter(record => record.wordCount === list.words.length).length
}

// `suffix(n)` is the localized mark for the nth copy, such as （コピー） and （コピー2）. Packs are named the same way.
export function copyName(lists: Pick<SavedWordList, 'name'>[], name: string, suffix: (n: number) => string) {
  const taken = new Set(lists.map(list => list.name.trim().toLocaleLowerCase()))
  for (let n = 1; ; n++) {
    const mark = suffix(n)
    const candidate = `${name.trim().slice(0, MAX_LIST_NAME - mark.length)}${mark}`
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate
  }
}

// A copy keeps the words, category and tags but starts without records, so its best is its own. It joins the source's
// pack at the end, without its levels, and only needs a name no other list of that pack has.
export function duplicateList(lists: SavedWordList[], id: string, copyId: string, suffix: (n: number) => string, now = new Date()) {
  const source = lists.find(list => list.id === id)
  if (!source) throw new AppError('listDeleted')
  // A list of a followed pack is the only one with an origin (a copy of a pack has none), and it cannot be copied inside it.
  if (source.origin) throw new AppError('packFollowed')
  // Only the lists of followed packs have an origin, so the copy is refused by the lists without one (see ownListCount).
  if (lists.filter(list => !list.origin).length >= MAX_LISTS) throw new AppError('listLimit', { max: MAX_LISTS })
  // The copy has no levels, so it is picked by its name: a first level of the pack is taken as a name is, or the copy
  // would overlap that list (see pathsOverlap) and be renamed when it is saved.
  const taken = lists.filter(list => list.packId === source.packId).flatMap(list => list.levels?.length ? [list, { name: list.levels[0] }] : [list])
  const copy: SavedWordList = { id: copyId, name: copyName(taken, source.name, suffix),
    createdAt: now.toISOString(), ...(source.packId === undefined ? {} : { packId: source.packId }),
    ...(source.category === undefined ? {} : { category: source.category }), ...(source.tags ? { tags: [...source.tags] } : {}),
    ...(source.writing ? { writing: { ...source.writing } } : {}),
    words: source.words.map(word => ({ ...word })), records: [] }
  return { lists: [...lists, copy], copy }
}
