import { listBest, type TimeUnit } from './records'
import type { SavedWordList } from './wordLists'

type StoredRecord = SavedWordList['records'][number]

export const STALE_DAYS = 3
export const LOW_ACCURACY = 90
const TREND_POINTS = 20
const DAY_MS = 24 * 60 * 60 * 1000

// Records store UTC timestamps; every day and week boundary here follows the viewer's local calendar.
export function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()) }
export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
export function startOfWeek(date: Date) {
  const day = startOfDay(date)
  return addDays(day, -((day.getDay() + 6) % 7))
}
function dayKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` }
function daysBetween(from: Date, to: Date) { return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS) }
function timeOf(record: StoredRecord) { return Date.parse(record.date) }
function newestFirst(records: StoredRecord[]) { return [...records].sort((a, b) => timeOf(b) - timeOf(a)) }
function average(values: number[]) { return values.reduce((total, value) => total + value, 0) / values.length }
function accuracies(records: StoredRecord[]) { return records.flatMap(record => record.accuracy === undefined ? [] : [record.accuracy]) }

export type Change = { recent: number; recentCount: number; previous: number; previousCount: number }
function change(newest: number[], recentCount: number, previousCount: number): Change | null {
  if (!recentCount || !previousCount) return null
  return { recent: average(newest.slice(0, recentCount)), recentCount, previous: average(newest.slice(recentCount, recentCount + previousCount)), previousCount }
}

export type DashboardSummary = {
  weekStart: Date
  weekCount: number
  previousWeekCount: number
  weekSeconds: number
  previousWeekSeconds: number
  streak: number
  practicedToday: boolean
  accuracy: { recent: number; recentCount: number; change: Change | null } | null
}

export function summarize(lists: SavedWordList[], now = new Date()): DashboardSummary {
  const records = lists.flatMap(list => list.records)
  const weekStart = startOfWeek(now)
  const between = (from: number, to: number) => records.filter(record => timeOf(record) >= from && timeOf(record) <= to)
  const week = between(weekStart.getTime(), addDays(weekStart, 7).getTime() - 1)
  // Compare against the same point of last week so Monday is not measured against a whole week.
  const previousWeek = between(addDays(weekStart, -7).getTime(), addDays(now, -7).getTime())
  const days = new Set(records.map(record => dayKey(new Date(timeOf(record)))))
  const today = startOfDay(now)
  const practicedToday = days.has(dayKey(today))
  let streak = 0
  for (let day = practicedToday ? today : addDays(today, -1); days.has(dayKey(day)); day = addDays(day, -1)) streak++
  const newest = accuracies(newestFirst(records))
  const recentCount = Math.min(10, newest.length)
  return {
    weekStart,
    weekCount: week.length,
    previousWeekCount: previousWeek.length,
    weekSeconds: week.reduce((total, record) => total + record.time, 0),
    previousWeekSeconds: previousWeek.reduce((total, record) => total + record.time, 0),
    streak,
    practicedToday,
    accuracy: recentCount ? { recent: average(newest.slice(0, recentCount)), recentCount, change: change(newest, recentCount, Math.min(10, newest.length - recentCount)) } : null,
  }
}

export type NextListReason = { kind: 'new' } | { kind: 'stale'; days: number } | { kind: 'accuracy'; accuracy: number; count: number }
export type NextList = { list: SavedWordList; lastPracticed: Date | null; reason: NextListReason }

export function nextLists(lists: SavedWordList[], now = new Date(), limit = 3): NextList[] {
  const groups: NextList[][] = [[], [], []]
  for (const list of lists) {
    const records = newestFirst(list.records)
    if (!records.length) { groups[0].push({ list, lastPracticed: null, reason: { kind: 'new' } }); continue }
    const lastPracticed = new Date(timeOf(records[0]))
    const days = daysBetween(lastPracticed, now)
    if (days >= STALE_DAYS) { groups[1].push({ list, lastPracticed, reason: { kind: 'stale', days } }); continue }
    const recent = accuracies(records).slice(0, 5)
    if (recent.length && average(recent) < LOW_ACCURACY) groups[2].push({ list, lastPracticed, reason: { kind: 'accuracy', accuracy: average(recent), count: recent.length } })
  }
  groups[1].sort((a, b) => (b.reason.kind === 'stale' ? b.reason.days : 0) - (a.reason.kind === 'stale' ? a.reason.days : 0))
  groups[2].sort((a, b) => (a.reason.kind === 'accuracy' ? a.reason.accuracy : 0) - (b.reason.kind === 'accuracy' ? b.reason.accuracy : 0))
  // Take from each reason in turn so a pile of unused lists never hides neglected or weak ones.
  const picked: NextList[] = []
  for (let index = 0; picked.length < limit && groups.some(group => index < group.length); index++) {
    for (const group of groups) if (group[index] && picked.length < limit) picked.push(group[index])
  }
  return picked
}

export type TrendPoint = { date: string; value: number }
export type Trend = { points: TrendPoint[]; change: Change | null }
export type ListTrend = { list: SavedWordList; count: number; lastPracticed: Date; speed: Trend; accuracy: Trend; best: StoredRecord }

function trend(points: TrendPoint[]): Trend {
  const newest = points.map(point => point.value).reverse()
  const recentCount = Math.min(5, Math.ceil(newest.length / 2))
  return { points: points.slice(-TREND_POINTS), change: change(newest, recentCount, Math.min(5, newest.length - recentCount)) }
}

export function listTrends(lists: SavedWordList[]): ListTrend[] {
  return lists.filter(list => list.records.length).map(list => {
    const records = newestFirst(list.records).reverse()
    return {
      list,
      count: records.length,
      lastPracticed: new Date(timeOf(records[records.length - 1])),
      // Seconds per word stays comparable after words are added to or removed from a list.
      speed: trend(records.flatMap(record => record.wordCount ? [{ date: record.date, value: record.time / record.wordCount }] : [])),
      accuracy: trend(records.flatMap(record => record.accuracy === undefined ? [] : [{ date: record.date, value: record.accuracy }])),
      best: listBest(list)!,
    }
  }).sort((a, b) => b.lastPracticed.getTime() - a.lastPracticed.getTime())
}

export type Scale = { domain: [number, number]; ticks: number[]; decimals: number }
const tidy = (value: number) => Math.round(value * 1e6) / 1e6
function niceStep(value: number) {
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  return tidy((fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power)
}

export function speedScale(values: number[]): Scale {
  const min = Math.min(...values), max = Math.max(...values)
  let step = niceStep(Math.max(max - min, max * 0.1, 0.01) / 2)
  let low = tidy(Math.floor(min / step) * step)
  while (tidy(low + step * 2) < max) {
    step = niceStep(step * 1.001)
    low = tidy(Math.floor(min / step) * step)
  }
  return { domain: [low, tidy(low + step * 2)], ticks: [tidy(low + step * 2), tidy(low + step), low], decimals: String(step).split('.')[1]?.length ?? 0 }
}

export function accuracyScale(values: number[]): Scale {
  const low = Math.max(0, Math.min(80, Math.floor(Math.min(...values) / 10) * 10))
  return { domain: [low, 100], ticks: [100, (low + 100) / 2, low], decimals: 0 }
}

// Units are names, not text: useFormat turns them into the reader's language.
export function durationParts(seconds: number): [string, TimeUnit][] {
  const total = Math.round(seconds)
  if (total < 60) return [[String(total), 'seconds']]
  if (total < 3600) return [[String(Math.floor(total / 60)), 'minutes'], [String(total % 60), 'seconds']]
  return [[String(Math.floor(total / 3600)), 'hours'], [String(Math.floor(total % 3600 / 60)), 'minutes']]
}

// How a day reads next to today: today and yesterday by name, other days by date, with the year only when it differs.
export type DayKind = 'today' | 'yesterday' | 'thisYear' | 'otherYear'
export function dayKind(date: Date, now = new Date()): DayKind {
  const days = daysBetween(date, now)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return date.getFullYear() === now.getFullYear() ? 'thisYear' : 'otherYear'
}
