import { AppError } from "./appError"
import type { PracticeDevice } from "./devices"
import { MAX_LISTS } from "./listOverview"
import { addRecord, type PracticeRecord } from "./records"
import { saveList, type SavedWordList } from "./wordLists"
import { validateLists } from "./workspaceRequest"

export type ApiWord = { display: string; input: string; annotation: string }
export type ListSummary = { id: string; name: string; wordCount: number; recordCount: number; createdAt: string; shared: boolean }
export type ListDetail = ListSummary & { words: ApiWord[]; shareUrl?: string }
export type StoredRecord = SavedWordList['records'][number]
export type NewList = { name: string; words: ApiWord[] }
export type ListPatch = { name?: string; words?: ApiWord[] }
export type NewRecord = { id?: string; time: number; date: string; mistakes: number; accuracy: number; wordCount?: number; deviceId?: string }

const MAX_RECORDS = 10000
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000

export function listSummary(list: SavedWordList): ListSummary {
  return { id: list.id, name: list.name, wordCount: list.words.length, recordCount: list.records.length,
    createdAt: list.createdAt, shared: list.shared === true }
}

export function listDetail(list: SavedWordList, origin: string): ListDetail {
  return { ...listSummary(list), words: list.words,
    ...(list.shared && list.shareId ? { shareUrl: `${origin}/shared/${list.shareId}` } : {}) }
}

export function findList(lists: SavedWordList[], listId: string) {
  const list = lists.find(item => item.id === listId)
  if (!list) throw new AppError('listNotFound')
  return list
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function decodeWords(value: unknown): ApiWord[] {
  if (!Array.isArray(value)) throw new AppError('invalidWorkspace')
  return value.map(word => {
    if (!isObject(word) || typeof word.display !== 'string' || typeof word.input !== 'string' ||
      (word.annotation !== undefined && typeof word.annotation !== 'string')) throw new AppError('invalidWorkspace')
    return { display: word.display, input: word.input, annotation: word.annotation ?? '' }
  })
}

export function decodeNewList(value: unknown): NewList {
  if (!isObject(value) || typeof value.name !== 'string') throw new AppError('invalidWorkspace')
  return { name: value.name, words: decodeWords(value.words) }
}

export function decodeListPatch(value: unknown): ListPatch {
  if (!isObject(value) || (value.name === undefined && value.words === undefined)) throw new AppError('invalidWorkspace')
  if (value.name !== undefined && typeof value.name !== 'string') throw new AppError('invalidWorkspace')
  return { ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.words === undefined ? {} : { words: decodeWords(value.words) }) }
}

// The workspace limits throw plain errors; the API reports them as an invalid workspace.
function checkWorkspace(lists: SavedWordList[]) {
  try {
    validateLists(lists)
  } catch (error) {
    throw error instanceof AppError ? error : new AppError('invalidWorkspace')
  }
}

export function createList(lists: SavedWordList[], input: NewList, id: string, now: Date) {
  if (lists.length >= MAX_LISTS) throw new AppError('listLimit', { max: MAX_LISTS })
  const list: SavedWordList = { id, name: input.name, words: input.words, records: [], createdAt: now.toISOString() }
  const saved = saveList(lists, list, false)
  checkWorkspace(saved)
  return { lists: saved, list: saved[saved.length - 1] }
}

export function updateList(lists: SavedWordList[], listId: string, patch: ListPatch) {
  const existing = findList(lists, listId)
  const saved = saveList(lists, { ...existing, ...patch }, true)
  checkWorkspace(saved)
  const list = findList(saved, listId)
  // An unchanged list keeps the same lists, so `modify` saves nothing and open web tabs keep their revision.
  if (list.name === existing.name && sameWords(list.words, existing.words)) return { lists, list: existing }
  return { lists: saved, list }
}

const sameWords = (a: ApiWord[], b: ApiWord[]) => a.length === b.length &&
  a.every((word, index) => word.display === b[index].display && word.input === b[index].input && word.annotation === b[index].annotation)

export function deleteList(lists: SavedWordList[], listId: string) {
  findList(lists, listId)
  return lists.filter(list => list.id !== listId)
}

export function decodeNewRecord(value: unknown): NewRecord {
  const invalid = () => new AppError('invalidRecord')
  if (!isObject(value)) throw invalid()
  const { id, time, date, mistakes, accuracy, wordCount, deviceId } = value
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) throw invalid()
  if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) throw invalid()
  if (typeof mistakes !== 'number' || !Number.isInteger(mistakes) || mistakes < 0) throw invalid()
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) throw invalid()
  if (wordCount !== undefined && (typeof wordCount !== 'number' || !Number.isInteger(wordCount) || wordCount < 1)) throw invalid()
  if (id !== undefined && (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id))) throw invalid()
  if (deviceId !== undefined && (typeof deviceId !== 'string' || !deviceId || deviceId.length > 100)) throw invalid()
  return { time, date: new Date(date).toISOString(), mistakes, accuracy,
    ...(id === undefined ? {} : { id }), ...(wordCount === undefined ? {} : { wordCount }),
    ...(deviceId === undefined ? {} : { deviceId }) }
}

export function addApiRecord(lists: SavedWordList[], listId: string, input: NewRecord, devices: PracticeDevice[], newId: string) {
  const list = findList(lists, listId)
  // A replayed id returns the stored record and the same lists reference, so callers can skip the write.
  const existing = input.id === undefined ? undefined : list.records.find(record => record.id === input.id)
  if (existing) return { lists, record: existing, created: false }
  const device = input.deviceId === undefined ? undefined : devices.find(item => item.id === input.deviceId)
  if (input.deviceId !== undefined && !device) throw new AppError('deviceNotFound')
  if (list.records.length >= MAX_RECORDS) throw new AppError('invalidRecord')
  const record: PracticeRecord = { id: input.id ?? newId, time: input.time, date: input.date, mistakes: input.mistakes,
    accuracy: input.accuracy, wordCount: input.wordCount ?? list.words.length,
    ...(device ? { device: { id: device.id, name: device.name, layout: device.layout } } : {}) }
  return { lists: addRecord(lists, listId, record), record, created: true }
}

export function selectRecords(list: SavedWordList, query: URLSearchParams): StoredRecord[] {
  const invalid = () => new AppError('invalidQuery')
  const sinceText = query.get('since')
  const since = sinceText === null ? null : Date.parse(sinceText)
  if (since !== null && !Number.isFinite(since)) throw invalid()
  const limitText = query.get('limit')
  if (limitText !== null && !/^\d+$/.test(limitText)) throw invalid()
  const limit = limitText === null ? DEFAULT_LIMIT : Number(limitText)
  if (limit < 1 || limit > MAX_LIMIT) throw invalid()
  return list.records.filter(record => since === null || Date.parse(record.date) > since)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, limit)
}
