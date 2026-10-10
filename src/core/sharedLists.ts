import { AppError } from './appError'
import { copyName, MAX_LISTS } from './listOverview'
import type { SavedWordList, WordList } from './wordLists'

/** What a share link shows: the list's name and words, never its owner or records. */
export type SharedListContent = { name: string; words: WordList['words'] }
export type SharedList = SharedListContent & { updatedAt: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Share ids are UUIDs the server issues, unlike list ids, which are only unique within a workspace. */
export function isShareId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function decodeSharedList(value: unknown): SharedList {
  const data = value as Record<string, unknown> | null
  if (!data || typeof data.name !== 'string' || typeof data.updatedAt !== 'string' || !Array.isArray(data.words) ||
      data.words.some(word => !word || typeof word.display !== 'string' || typeof word.input !== 'string' || typeof word.annotation !== 'string')) {
    throw new AppError('invalidServerData')
  }
  return { name: data.name, words: data.words, updatedAt: data.updatedAt }
}

// A copy is the reader's own list: later changes to the shared list do not reach it, and it starts without records.
export function copySharedList(lists: SavedWordList[], shared: SharedListContent, copyId: string, suffix: (n: number) => string, now = new Date()) {
  if (lists.length >= MAX_LISTS) throw new AppError('listLimit', { max: MAX_LISTS })
  const taken = lists.some(list => list.name.trim().toLocaleLowerCase() === shared.name.trim().toLocaleLowerCase())
  const copy: SavedWordList = { id: copyId, name: taken ? copyName(lists, shared.name, suffix) : shared.name.trim(), createdAt: now.toISOString(),
    words: shared.words.map(word => ({ display: word.display, input: word.input, annotation: word.annotation })), records: [] }
  return { lists: [...lists, copy], copy }
}

/** The ids of the lists whose owner has turned sharing on. */
export function sharedKeys(lists: SavedWordList[]) {
  return lists.filter(list => list.shared).map(list => list.id)
}

/** Share ids come from the server only, so the ones a client sends back are dropped before saving. */
export function stripShareIds(lists: SavedWordList[]): SavedWordList[] {
  return lists.map(({ shareId: _shareId, ...list }) => list)
}
