import { AppError } from './appError'
import type { SavedWordList } from './wordLists'

export const MAX_LISTS = 150
export const MAX_LIST_NAME = 200

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

// Matches the list name and the words, so a list can be found by one of its words.
export function matchesQuery(list: SavedWordList, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return true
  return list.name.toLocaleLowerCase().includes(needle) ||
    list.words.some(word => word.display.toLocaleLowerCase().includes(needle) || word.input.toLocaleLowerCase().includes(needle))
}

// The first words of a list and how many more there are; the screen joins them in the reader's language.
export function wordPreview(list: SavedWordList, limit = 6) {
  return { words: list.words.slice(0, limit).map(word => word.display.trim()), rest: Math.max(0, list.words.length - limit) }
}

// The records a list's best is taken from: runs at its current word count (see comparableRecords).
export function currentRecordCount(list: Pick<SavedWordList, 'words' | 'records'>) {
  return list.records.filter(record => record.wordCount === list.words.length).length
}

// `suffix(n)` is the localized mark for the nth copy, such as （コピー） and （コピー2）.
export function copyName(lists: SavedWordList[], name: string, suffix: (n: number) => string) {
  const taken = new Set(lists.map(list => list.name.trim().toLocaleLowerCase()))
  for (let n = 1; ; n++) {
    const mark = suffix(n)
    const candidate = `${name.trim().slice(0, MAX_LIST_NAME - mark.length)}${mark}`
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate
  }
}

// A copy keeps the words but starts without records, so its best is its own.
export function duplicateList(lists: SavedWordList[], id: string, copyId: string, suffix: (n: number) => string, now = new Date()) {
  const source = lists.find(list => list.id === id)
  if (!source) throw new AppError('listDeleted')
  if (lists.length >= MAX_LISTS) throw new AppError('listLimit', { max: MAX_LISTS })
  const copy: SavedWordList = { id: copyId, name: copyName(lists, source.name, suffix), createdAt: now.toISOString(),
    words: source.words.map(word => ({ ...word })), records: [] }
  return { lists: [...lists, copy], copy }
}
