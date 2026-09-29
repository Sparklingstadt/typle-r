import { comparableRecords, matchesDevice, rankRecords, type RankOrder } from './records'
import type { SavedWordList } from './wordLists'

type StoredRecord = SavedWordList['records'][number]

const DAY_MS = 24 * 60 * 60 * 1000
export const RANKING_TOP = 5
// A best set within this many days is marked 「更新」 in the list.
export const IMPROVED_DAYS = 7
const TREND_POINTS = 20
const RECENT_RUNS = 5

export type RankingOptions = { device?: string | null; order?: RankOrder; includeOthers?: boolean; now?: Date }

export type ListRanking = {
  list: SavedWordList
  // The list's records on the chosen device, at any word count.
  records: StoredRecord[]
  ranked: StoredRecord[]
  // Records at another word count than the list has now; they are ranked only when asked for, or when nothing else exists.
  others: StoredRecord[]
  otherCounts: { wordCount: number | null; count: number }[]
  fallback: boolean
  best: StoredRecord | undefined
  lastPracticed: Date | null
  improved: boolean
}

// Uses the same comparison as `listBest`, so a list's rank 1 here is the best shown on every other screen.
export function listRanking(list: SavedWordList, { device = null, order = 'accuracy', includeOthers = false, now = new Date() }: RankingOptions = {}): ListRanking {
  const records = list.records.filter(record => matchesDevice(record, device))
  const others = records.filter(record => record.wordCount !== list.words.length)
  const fallback = others.length > 0 && others.length === records.length
  const ranked = rankRecords(includeOthers ? records : comparableRecords(list, records), order)
  const counts = new Map<number | null, number>()
  for (const record of others) counts.set(record.wordCount ?? null, (counts.get(record.wordCount ?? null) ?? 0) + 1)
  const last = records.reduce((latest, record) => Math.max(latest, Date.parse(record.date)), 0)
  const best = ranked[0]
  const bestTime = best ? Date.parse(best.date) : 0
  return {
    list, records, ranked, others, fallback, best,
    otherCounts: [...counts].map(([wordCount, count]) => ({ wordCount, count }))
      .sort((a, b) => (b.wordCount ?? -1) - (a.wordCount ?? -1)),
    lastPracticed: last ? new Date(last) : null,
    improved: !!best && now.getTime() - bestTime < IMPROVED_DAYS * DAY_MS && ranked.some(record => Date.parse(record.date) < bestTime),
  }
}

export type ListSort = 'recent' | 'name' | 'count'
export const LIST_SORTS: Record<ListSort, string> = { recent: '最近練習した順', name: '名前順', count: '記録が多い順' }

export function sortRankings(rankings: ListRanking[], sort: ListSort) {
  const recent = (a: ListRanking, b: ListRanking) => (b.lastPracticed?.getTime() ?? 0) - (a.lastPracticed?.getTime() ?? 0)
  return [...rankings].sort(sort === 'name' ? (a, b) => a.list.name.localeCompare(b.list.name, 'ja')
    : sort === 'count' ? (a, b) => b.records.length - a.records.length || recent(a, b)
      : recent)
}

// The figures above the table: the latest runs show where practice is now, next to the best.
export function rankingStats(ranked: StoredRecord[]) {
  const byDate = [...ranked].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const recent = byDate.slice(-RECENT_RUNS)
  const accuracies = recent.flatMap(record => record.accuracy === undefined ? [] : [record.accuracy])
  return {
    recentCount: recent.length,
    recentTime: recent.length ? recent.reduce((total, record) => total + record.time, 0) / recent.length : null,
    recentAccuracy: accuracies.length ? accuracies.reduce((total, accuracy) => total + accuracy, 0) / accuracies.length : null,
    points: byDate.slice(-TREND_POINTS).map(record => ({ date: record.date, value: record.time })),
  }
}
