import { AppError } from "./appError"
import type { PracticeDevice } from "./devices"
import type { SavedWordList } from "./wordLists"
import { sessionResult, TypingSession } from "./typing"

export type TimeUnit = "hours" | "minutes" | "seconds"

export type PracticeRecord = {
  id: string
  time: number
  date: string
  mistakes: number
  accuracy: number
  device?: PracticeDevice
  wordCount: number
}

export function makeRecord(session: TypingSession, wordCount: number, id: string, device?: PracticeDevice): PracticeRecord {
  if (session.finishedAt === null || session.startedAt === null) throw new AppError('practiceIncomplete')
  return { ...(device ? { device: { ...device } } : {}), ...sessionResult(session), id, wordCount, date: new Date(session.finishedAt).toISOString() }
}

export function addRecord(lists: SavedWordList[], listId: string, record: PracticeRecord) {
  if (!lists.some(list => list.id === listId)) throw new AppError('recordListDeleted')
  return lists.map(list => list.id !== listId || list.records.some(item => item.id === record.id)
    ? list : { ...list, records: [...list.records, record] })
}

type StoredRecord = SavedWordList['records'][number]

export function recentRecords(lists: SavedWordList[]) {
  return lists.flatMap(list => list.records.map((record, index) => ({ list, record, index })))
    .sort((a, b) => Date.parse(b.record.date) - Date.parse(a.record.date))
}

// For choosing a list to practise: lists practised most recently first, then the rest in their saved order.
export function byRecentPractice<T extends Pick<SavedWordList, 'records'>>(lists: T[]) {
  const last = (list: T) => Math.max(-Infinity, ...list.records.map(record => Date.parse(record.date)).filter(Number.isFinite))
  return lists.map((list, index) => ({ list, index, last: last(list) }))
    .sort((a, b) => (b.last === a.last ? 0 : b.last > a.last ? 1 : -1) || a.index - b.index)
    .map(item => item.list)
}

// accuracy: the higher accuracy wins and time breaks ties (records without accuracy come last). speed: the reverse.
export type RankOrder = 'accuracy' | 'speed'

export function rankRecords(records: StoredRecord[], order: RankOrder = 'accuracy') {
  return [...records].sort(order === 'accuracy'
    ? (a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1) || a.time - b.time
    : (a, b) => a.time - b.time || (b.accuracy ?? -1) - (a.accuracy ?? -1))
}

export function bestRecords(records: StoredRecord[], limit = 5, order: RankOrder = 'accuracy') {
  return rankRecords(records, order).slice(0, limit)
}

// Editing a list changes the task, so only runs at its current word count are compared. Records without a word
// count predate that field and cannot be matched. With no matching run, every record is compared instead.
export function comparableRecords(list: Pick<SavedWordList, 'words' | 'records'>, records: StoredRecord[] = list.records) {
  const same = records.filter(record => record.wordCount === list.words.length)
  return same.length ? same : records
}

// The record every screen shows as a list's best: ベスト記録, the practice result, 練習記録 and the home dashboard.
export function listBest(list: Pick<SavedWordList, 'words' | 'records'>) {
  return bestRecords(comparableRecords(list), 1)[0]
}

export function removeRecord(lists: SavedWordList[], listId: string, record: StoredRecord) {
  return lists.map(list => list.id !== listId ? list : {
    ...list, records: list.records.filter(item => record.id
      ? item.id !== record.id : !(item.date === record.date && item.time === record.time)),
  })
}

export type RecordRow = { list: SavedWordList; record: StoredRecord; index: number; key: string; best: boolean }
export type RecordFilter = { pack: string | null; list: string | null; device: string | null }
export const NO_DEVICE = 'none'

// Every record with its list, newest first. `best` marks the record that currently ranks first in its list.
export function recordRows(lists: SavedWordList[]): RecordRow[] {
  const best = new Set(lists.flatMap(list => listBest(list) ?? []))
  return recentRecords(lists).map(({ list, record, index }) =>
    ({ list, record, index, key: `${list.id}-${record.id ?? `${index}-${record.date}`}`, best: best.has(record) }))
}

export function matchesDevice(record: StoredRecord, device: string | null) {
  return !device || (device === NO_DEVICE ? !record.device : record.device?.id === device)
}

export function filterRows(rows: RecordRow[], filter: RecordFilter) {
  return rows.filter(row => (!filter.pack || row.list.packId === filter.pack) && (!filter.list || row.list.id === filter.list) && matchesDevice(row.record, filter.device))
}

// Devices come from the records themselves, so deleted or renamed devices can still be picked (by id, with the
// newest name). Records without a device (no `device`) are grouped last.
export function deviceOptions(records: StoredRecord[]) {
  const options = new Map<string, { value: string; device?: PracticeDevice; count: number }>()
  for (const record of [...records].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
    const value = record.device?.id ?? NO_DEVICE
    const option = options.get(value)
    if (option) option.count++
    else options.set(value, { value, ...(record.device ? { device: record.device } : {}), count: 1 })
  }
  return [...options.values()].sort((a, b) => Number(a.value === NO_DEVICE) - Number(b.value === NO_DEVICE) || b.count - a.count)
}

// Days follow the viewer's local calendar, like the home dashboard.
export function groupByDay(rows: RecordRow[]) {
  const groups: { day: Date; rows: RecordRow[]; seconds: number }[] = []
  for (const row of rows) {
    const date = new Date(row.record.date)
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const last = groups[groups.length - 1]
    if (last && last.day.getTime() === day.getTime()) { last.rows.push(row); last.seconds += row.record.time }
    else groups.push({ day, rows: [row], seconds: row.record.time })
  }
  return groups
}

// Seconds keep two decimals so close runs stay distinguishable; a minute or more is split into minutes and seconds.
// Units are names, not text: useFormat turns them into the reader's language.
export function recordTimeParts(seconds: number): [string, TimeUnit][] {
  // Round first so 59.999 becomes 1 min 00.00 s rather than 60.00 s.
  const hundredths = Math.round(seconds * 100)
  if (hundredths < 6000) return [[(hundredths / 100).toFixed(2), 'seconds']]
  return [[String(Math.floor(hundredths / 6000)), 'minutes'], [(hundredths % 6000 / 100).toFixed(2).padStart(5, '0'), 'seconds']]
}

export function secondsPerWord(record: StoredRecord) {
  return record.wordCount ? record.time / record.wordCount : null
}

export function formatAccuracy(accuracy: number | undefined) {
  return accuracy === undefined ? '—' : `${Math.round(accuracy * 10) / 10}%`
}
