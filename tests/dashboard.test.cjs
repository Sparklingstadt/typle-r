// Day and week boundaries follow the local calendar; pin it so the fixtures are deterministic.
process.env.TZ = 'Asia/Tokyo'
require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { summarize, nextLists, listTrends, speedScale, accuracyScale, durationParts, dayKind, startOfWeek } = require('../src/lib/dashboard.ts')

// Sunday 2026-09-27 21:00 JST
const now = new Date('2026-09-27T12:00:00Z')
const words = [{ display: 'a', input: 'a', annotation: '' }, { display: 'b', input: 'b', annotation: '' }]
const record = (date, time = 10, extra = {}) => ({ id: date + time, date, time, wordCount: 2, accuracy: 100, mistakes: 0, ...extra })
const list = (id, records) => ({ id, name: id, createdAt: '2026-09-01', words, records })

test('weeks start on local Monday and records split by local day, not UTC', () => {
  assert.equal(startOfWeek(now).toISOString(), '2026-09-20T15:00:00.000Z')
  // 23:30 UTC on the 20th is already Monday 08:30 in Tokyo; 14:30 UTC is still Sunday there.
  const summary = summarize([list('a', [record('2026-09-20T23:30:00Z'), record('2026-09-20T14:30:00Z')])], now)
  assert.equal(summary.weekCount, 1)
})

test('summary compares with the same point of last week and counts the streak', () => {
  const summary = summarize([list('a', [
    record('2026-09-27T01:00:00Z', 30), record('2026-09-26T01:00:00Z', 30), record('2026-09-25T01:00:00Z', 30),
    record('2026-09-23T01:00:00Z', 30),
    record('2026-09-14T01:00:00Z', 20), record('2026-09-20T13:00:00Z', 20),
  ])], now)
  assert.equal(summary.weekCount, 4)
  assert.equal(summary.weekSeconds, 120)
  // Sunday 22:00 JST last week is after "now minus 7 days", so it is left out of the comparison.
  assert.equal(summary.previousWeekCount, 1)
  assert.equal(summary.previousWeekSeconds, 20)
  assert.equal(summary.streak, 3)
  assert.equal(summary.practicedToday, true)
})

test('streak continues from yesterday until the user practices today', () => {
  const summary = summarize([list('a', [record('2026-09-26T01:00:00Z'), record('2026-09-25T01:00:00Z')])], now)
  assert.equal(summary.practicedToday, false)
  assert.equal(summary.streak, 2)
  assert.equal(summarize([list('a', [record('2026-09-24T01:00:00Z')])], now).streak, 0)
})

test('accuracy averages the latest ten records with accuracy and compares with the ten before', () => {
  const records = Array.from({ length: 14 }, (_, index) => record(new Date(Date.UTC(2026, 8, 10 + index)).toISOString(), 10, { accuracy: index < 4 ? 80 : 90 }))
  records.push(record('2026-09-26T00:00:00Z', 10, { accuracy: undefined }))
  const { accuracy } = summarize([list('a', records)], now)
  assert.equal(accuracy.recentCount, 10)
  assert.equal(accuracy.recent, 90)
  assert.deepEqual([accuracy.change.previous, accuracy.change.previousCount], [80, 4])
  assert.equal(summarize([list('a', [record('2026-09-26T00:00:00Z', 1, { accuracy: undefined })])], now).accuracy, null)
})

test('next lists rotate through unused, neglected and inaccurate lists', () => {
  const lists = [
    list('new-1', []), list('new-2', []),
    list('stale-4', [record('2026-09-23T01:00:00Z')]), list('stale-9', [record('2026-09-18T01:00:00Z')]),
    list('weak', [record('2026-09-26T01:00:00Z', 10, { accuracy: 70 }), record('2026-09-10T01:00:00Z', 10, { accuracy: 100 })]),
    list('fine', [record('2026-09-26T01:00:00Z', 10, { accuracy: 95 })]),
    list('legacy', [{ time: 5, date: '2026/09/26 10:05' }]),
  ]
  const picked = nextLists(lists, now)
  assert.deepEqual(picked.map(item => item.list.id), ['new-1', 'stale-9', 'weak'])
  assert.deepEqual(picked[1].reason, { kind: 'stale', days: 9 })
  assert.deepEqual(picked[2].reason, { kind: 'accuracy', accuracy: 85, count: 2 })
  assert.deepEqual(nextLists(lists, now, 6).map(item => item.list.id), ['new-1', 'stale-9', 'weak', 'new-2', 'stale-4'])
  // Two calendar days, even though fewer than 48 hours have passed.
  assert.equal(nextLists([list('x', [record('2026-09-25T14:59:00Z')])], now).length, 0)
  assert.equal(nextLists([list('x', [record('2026-09-24T14:59:00Z')])], now)[0].reason.days, 3)
})

test('trends use seconds per word, skip incomplete legacy records and order by last practice', () => {
  const trends = listTrends([
    list('older', [record('2026-09-20T01:00:00Z')]),
    list('recent', [
      record('2026-09-26T01:00:00Z', 8, { wordCount: 4, accuracy: 95 }),
      record('2026-09-24T01:00:00Z', 6, { wordCount: 2, accuracy: 90 }),
      { time: 9, date: '2026-09-22T01:00:00Z' },
      record('2026-09-25T01:00:00Z', 5, { wordCount: 2, accuracy: 100 }),
    ]),
    list('empty', []),
  ])
  assert.deepEqual(trends.map(trend => trend.list.id), ['recent', 'older'])
  const [recent] = trends
  assert.equal(recent.count, 4)
  assert.deepEqual(recent.speed.points.map(point => point.value), [3, 2.5, 2])
  assert.deepEqual(recent.accuracy.points.map(point => point.value), [90, 100, 95])
  assert.deepEqual(recent.speed.change, { recent: 2.25, recentCount: 2, previous: 3, previousCount: 1 })
  assert.equal(recent.best.accuracy, 100)
  assert.equal(trends[1].speed.change, null)
})

test('trends keep the latest twenty points and compare five against five', () => {
  const records = Array.from({ length: 25 }, (_, index) => record(new Date(Date.UTC(2026, 8, 1 + index)).toISOString(), index + 1, { wordCount: 1 }))
  const [trend] = listTrends([list('a', records)])
  assert.equal(trend.speed.points.length, 20)
  assert.equal(trend.speed.points[0].value, 6)
  assert.deepEqual(trend.speed.change, { recent: 23, recentCount: 5, previous: 18, previousCount: 5 })
})

test('chart scales use three even, readable ticks', () => {
  assert.deepEqual(speedScale([1.42, 1.92]), { domain: [1, 2], ticks: [2, 1.5, 1], decimals: 1 })
  assert.deepEqual(speedScale([2.6, 3.5]), { domain: [2.5, 3.5], ticks: [3.5, 3, 2.5], decimals: 1 })
  assert.deepEqual(speedScale([0.31, 0.33]).ticks, [0.34, 0.32, 0.3])
  assert.deepEqual(speedScale([0, 0]).domain, [0, 0.01])
  for (const values of [[1.42, 1.92], [2.6, 3.5], [0.31, 0.33], [7, 70], [0, 0]]) {
    const { domain } = speedScale(values)
    assert.ok(domain[0] <= Math.min(...values) && domain[1] >= Math.max(...values), `${values} fits ${domain}`)
  }
  assert.deepEqual(accuracyScale([92, 98]).ticks, [100, 90, 80])
  assert.deepEqual(accuracyScale([55, 98]).ticks, [100, 75, 50])
})

test('durations split into units, and days are named relative to today', () => {
  assert.deepEqual(durationParts(45.4), [['45', 'seconds']])
  assert.deepEqual(durationParts(1112), [['18', 'minutes'], ['32', 'seconds']])
  assert.deepEqual(durationParts(3725), [['1', 'hours'], ['2', 'minutes']])
  assert.equal(dayKind(new Date('2026-09-27T00:30:00Z'), now), 'today')
  assert.equal(dayKind(new Date('2026-09-26T14:30:00Z'), now), 'yesterday')
  assert.equal(dayKind(new Date('2026-09-19T01:00:00Z'), now), 'thisYear')
  assert.equal(dayKind(new Date('2025-12-31T01:00:00Z'), now), 'otherYear')
})
