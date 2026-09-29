import type { SavedWordList } from './wordLists'

export const MAX_LISTS = 100
export const MAX_LIST_NAME = 200

export type ListOverview = {
  list: SavedWordList
  /** Position in the saved order, which is the order the lists were added in. */
  position: number
  practiceCount: number
  lastPracticed: number | null
}

export type ListOrder = 'added' | 'practiced' | 'name' | 'words'
export const LIST_ORDERS: Record<ListOrder, string> = { added: '追加した順', practiced: '最近練習した順', name: '名前順', words: '単語が多い順' }

export function listOverviews(lists: SavedWordList[]): ListOverview[] {
  return lists.map((list, position) => {
    const dates = list.records.map(record => Date.parse(record.date)).filter(Number.isFinite)
    return { list, position, practiceCount: list.records.length, lastPracticed: dates.length ? Math.max(...dates) : null }
  })
}

// Newest first for 追加した順. Lists without a record come after the practised ones for 最近練習した順.
export function sortOverviews(items: ListOverview[], order: ListOrder) {
  const collator = new Intl.Collator('ja', { numeric: true })
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

export function wordPreview(list: SavedWordList, limit = 6) {
  const shown = list.words.slice(0, limit).map(word => word.display.trim()).join('・')
  return list.words.length > limit ? `${shown} ほか${list.words.length - limit}語` : shown
}

// The records a list's best is taken from: runs at its current word count (see comparableRecords).
export function currentRecordCount(list: Pick<SavedWordList, 'words' | 'records'>) {
  return list.records.filter(record => record.wordCount === list.words.length).length
}

export function copyName(lists: SavedWordList[], name: string) {
  const taken = new Set(lists.map(list => list.name.trim().toLocaleLowerCase()))
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '（コピー）' : `（コピー${n}）`
    const candidate = `${name.trim().slice(0, MAX_LIST_NAME - suffix.length)}${suffix}`
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate
  }
}

// A copy keeps the words but starts without records, so its best is its own.
export function duplicateList(lists: SavedWordList[], id: string, copyId: string, now = new Date()) {
  const source = lists.find(list => list.id === id)
  if (!source) throw new Error('この単語リストは削除されています。画面を開き直してください。')
  if (lists.length >= MAX_LISTS) throw new Error(`単語リストは${MAX_LISTS}件まで保存できます。`)
  const copy: SavedWordList = { id: copyId, name: copyName(lists, source.name), createdAt: now.toISOString(),
    words: source.words.map(word => ({ ...word })), records: [] }
  return { lists: [...lists, copy], copy }
}
