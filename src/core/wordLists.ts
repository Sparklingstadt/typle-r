import { AppError } from "./appError"
import { isDevice, type PracticeDevice } from "./devices"

export type WordList = {
  id?: string,
  name: string,
  /** A broad grouping, such as プログラミング or 語学. Left out when the list has none. */
  category?: string,
  /** What the list is about, such as Kotlin or PostgreSQL. Left out when it has none. */
  tags?: string[],
  words: {
    display: string,
    input: string,
    annotation: string
  }[],
  records: {
    id?: string,
    time: number,
    date: string,
    mistakes?: number,
    accuracy?: number,
    device?: PracticeDevice,
    wordCount?: number
  }[],
  createdAt: string
}

export type SavedWordList = WordList & { id: string }

// The limits of a list's category and tags, in UTF-16 code units as for the name (see validateLists).
export const MAX_CATEGORY = 50
export const MAX_TAG = 50
export const MAX_TAGS = 20

/** The category and tags as they are saved: trimmed, without empty ones or a tag repeated in another case, and left out
 * when there are none, so a list without them is stored as before they existed. */
export function normalizeLabels({ category, tags }: Pick<WordList, 'category' | 'tags'>): Pick<WordList, 'category' | 'tags'> {
  const name = category?.trim() ?? ''
  const seen = new Set<string>()
  const kept: string[] = []
  for (const tag of tags ?? []) {
    const value = tag.trim()
    if (!value || seen.has(value.toLocaleLowerCase())) continue
    seen.add(value.toLocaleLowerCase())
    kept.push(value)
  }
  return { ...(name ? { category: name } : {}), ...(kept.length ? { tags: kept } : {}) }
}

export function validateList(list: WordList, others: WordList[] = []) {
  if (!list.name.trim()) throw new AppError('listNameRequired')
  if (others.some(other => other.name.trim().toLocaleLowerCase() === list.name.trim().toLocaleLowerCase())) {
    throw new AppError('listNameDuplicate')
  }
  if (!list.words.length) throw new AppError('wordsRequired')
  if (list.words.some(word => !word.display.trim() || !word.input.trim())) {
    throw new AppError('wordFieldsRequired')
  }
}

export function decodeLists(raw: string): SavedWordList[] {
  const data = JSON.parse(raw)
  if (data?.version !== 1 || !Array.isArray(data.lists)) throw new AppError('savedDataUnreadable')
  const ids = new Set<string>()
  for (const list of data.lists) {
    if (!list || typeof list.id !== "string" || !list.id || ids.has(list.id) || typeof list.name !== "string" ||
        typeof list.createdAt !== "string" || !Array.isArray(list.words) || !Array.isArray(list.records) ||
        (list.category !== undefined && typeof list.category !== "string") ||
        (list.tags !== undefined && (!Array.isArray(list.tags) || list.tags.some((tag: unknown) => typeof tag !== "string"))) ||
        list.words.some((word: WordList['words'][number]) => !word || typeof word.display !== "string" || typeof word.input !== "string" || typeof word.annotation !== "string") ||
        list.records.some((record: WordList['records'][number]) => !record || !Number.isFinite(record.time) || record.time < 0 || typeof record.date !== "string" ||
          !Number.isFinite(Date.parse(record.date)) ||
          (record.device !== undefined && !isDevice(record.device)) ||
          (record.id !== undefined && typeof record.id !== "string") ||
          (record.accuracy !== undefined && (!Number.isFinite(record.accuracy) || record.accuracy < 0 || record.accuracy > 100)) ||
          (record.mistakes !== undefined && (!Number.isInteger(record.mistakes) || record.mistakes < 0)) ||
          (record.wordCount !== undefined && (!Number.isInteger(record.wordCount) || record.wordCount < 1)))) {
      throw new AppError('savedDataCorrupted')
    }
    validateList(list)
    ids.add(list.id)
  }
  // Lists saved while link sharing existed may still carry its fields; they mean nothing now.
  return data.lists.map(({ shared: _shared, shareId: _shareId, ...list }: SavedWordList & { shared?: unknown, shareId?: unknown }) => list)
}

export function encodeLists(lists: SavedWordList[]) {
  const raw = JSON.stringify({ version: 1, lists })
  decodeLists(raw)
  return raw
}

export function saveList(lists: SavedWordList[], list: SavedWordList, editing: boolean) {
  if (editing && !lists.some(item => item.id === list.id)) throw new AppError('listDeleted')
  validateList(list, lists.filter(item => item.id !== list.id))
  // Whitespace can be meaningful in imported typing strings and annotations.
  const { category, tags, ...rest } = list
  const normalized = { ...rest, name: list.name.trim(), ...normalizeLabels({ category, tags }) }
  // The editor's copy of a list knows nothing of its records, so those stay as saved.
  const keep = (item: SavedWordList): SavedWordList => ({ ...normalized, records: item.records })
  if (!editing && lists.some(item => item.id === list.id)) return lists.map(item => item.id === list.id ? keep(item) : item)
  return editing ? lists.map(item => item.id === list.id ? keep(item) : item) : [...lists, normalized]
}
