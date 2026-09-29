import { deviceLabel, type PracticeDevice } from "./devices"
import type { SavedWordList } from "./wordLists"
import { sessionResult, TypingSession } from "./typing"

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
  if (session.finishedAt === null || session.startedAt === null) throw new Error("練習が完了していません。")
  return { ...(device ? { device: { ...device } } : {}), ...sessionResult(session), id, wordCount, date: new Date(session.finishedAt).toISOString() }
}

export function addRecord(lists: SavedWordList[], listId: string, record: PracticeRecord) {
  if (!lists.some(list => list.id === listId)) throw new Error("単語リストが削除されているため、記録を保存できません。")
  return lists.map(list => list.id !== listId || list.records.some(item => item.id === record.id)
    ? list : { ...list, records: [...list.records, record] })
}

type StoredRecord = SavedWordList['records'][number]

export function recentRecords(lists: SavedWordList[]) {
  return lists.flatMap(list => list.records.map((record, index) => ({ list, record, index })))
    .sort((a, b) => Date.parse(b.record.date) - Date.parse(a.record.date))
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
export type RecordFilter = { list: string | null; device: string | null }
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
  return rows.filter(row => (!filter.list || row.list.id === filter.list) && matchesDevice(row.record, filter.device))
}

// Devices come from the records themselves, so deleted or renamed devices can still be picked (by id, with the
// newest name). Records without a device are grouped last.
export function deviceOptions(records: StoredRecord[]) {
  const options = new Map<string, { value: string; label: string; count: number }>()
  for (const record of [...records].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
    const value = record.device?.id ?? NO_DEVICE
    const option = options.get(value)
    if (option) option.count++
    else options.set(value, { value, label: record.device ? deviceLabel(record.device) : '端末の記録なし', count: 1 })
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

// Seconds keep two decimals so close runs stay distinguishable; a minute or more is split into 分 and 秒.
export function recordTimeParts(seconds: number): [string, string][] {
  // Round first so 59.999 becomes 1分00.00秒 rather than 60.00秒.
  const hundredths = Math.round(seconds * 100)
  if (hundredths < 6000) return [[(hundredths / 100).toFixed(2), '秒']]
  return [[String(Math.floor(hundredths / 6000)), '分'], [(hundredths % 6000 / 100).toFixed(2).padStart(5, '0'), '秒']]
}

export function formatRecordTime(seconds: number) {
  return recordTimeParts(seconds).map(part => part.join('')).join('')
}

export function secondsPerWord(record: StoredRecord) {
  return record.wordCount ? record.time / record.wordCount : null
}

export function formatAccuracy(accuracy: number | undefined) {
  return accuracy === undefined ? '—' : `${Math.round(accuracy * 10) / 10}%`
}
