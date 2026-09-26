import type { PracticeDevice } from "./devices"
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

export function bestRecords(records: StoredRecord[], limit = 5) {
  return [...records].sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1) || a.time - b.time).slice(0, limit)
}

export function removeRecord(lists: SavedWordList[], listId: string, record: StoredRecord) {
  return lists.map(list => list.id !== listId ? list : {
    ...list, records: list.records.filter(item => record.id
      ? item.id !== record.id : !(item.date === record.date && item.time === record.time)),
  })
}
