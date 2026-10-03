import { AppError } from "./appError"
import { isDevice } from "./devices"
import type { WordList } from "../types/WordList"

export type SavedWordList = WordList & { id: string }
export const STORAGE_KEY = "typle-r:word-lists:v1"

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
  return data.lists
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
  const normalized = { ...list, name: list.name.trim() }
  if (!editing && lists.some(item => item.id === list.id)) return lists.map(item => item.id === list.id ? { ...normalized, records: item.records } : item)
  return editing ? lists.map(item => item.id === list.id ? { ...normalized, records: item.records } : item) : [...lists, normalized]
}
