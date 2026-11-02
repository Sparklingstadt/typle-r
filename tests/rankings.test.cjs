require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { rankRecords, bestRecords, comparableRecords, listBest, recordRows, deviceOptions, matchesDevice, NO_DEVICE } = require('../src/core/records.ts')
const { listRanking, sortRankings, rankingStats } = require('../src/core/rankings.ts')

const mac = { id: 'mac', name: 'MacBook Air', layout: 'JIS' }
const pad = { id: 'pad', name: 'iPad', layout: '' }
const words = count => Array.from({ length: count }, (_, index) => ({ display: `w${index}`, input: `w${index}`, annotation: '' }))
const at = (day, hour = 12) => new Date(2026, 8, day, hour).toISOString()
const now = new Date(2026, 8, 29, 13)
const record = (id, time, accuracy, wordCount, day, device) =>
  ({ id, time, date: at(day), mistakes: 0, wordCount, ...(accuracy === undefined ? {} : { accuracy }), ...(device ? { device } : {}) })

// "英単語" had 10 words, then 2 were added: the older, shorter runs must not outrank today's runs.
const edited = () => ({ id: 'en', name: '英単語', createdAt: '2026-09-01', words: words(12), records: [
  record('old1', 11.84, 100, 10, 20, mac),
  record('old2', 12.9, 98, 10, 21, pad),
  record('new1', 15.2, 97.5, 12, 26, mac),
  record('new2', 14.35, 100, 12, 28, pad),
  record('new3', 20.05, 100, 12, 29, mac),
  record('legacy', 9.5, undefined, undefined, 10),
] })

test('accuracy-first ranks by accuracy then time; speed-first by time then accuracy; missing accuracy is last', () => {
  const records = [record('a', 20.05, 100, 5, 1), record('b', 17.96, 96.6, 5, 2), record('c', 17.96, 99, 5, 3), record('d', 9, undefined, 5, 4)]
  assert.deepEqual(rankRecords(records).map(item => item.id), ['a', 'c', 'b', 'd'])
  assert.deepEqual(rankRecords(records, 'speed').map(item => item.id), ['d', 'c', 'b', 'a'])
  assert.deepEqual(bestRecords(records, 2).map(item => item.id), ['a', 'c'])
  assert.deepEqual(records.map(item => item.id), ['a', 'b', 'c', 'd'], 'ranking leaves the stored order alone')
})

test('only runs at the current word count are compared, unless there are none', () => {
  const list = edited()
  assert.deepEqual(comparableRecords(list).map(item => item.id), ['new1', 'new2', 'new3'])
  assert.equal(listBest(list).id, 'new2')
  const onlyOld = { ...list, records: list.records.filter(item => item.wordCount !== 12) }
  assert.equal(comparableRecords(onlyOld).length, 3)
  assert.equal(listBest(onlyOld).id, 'old1')
  assert.equal(listBest({ ...list, records: [] }), undefined)
  const rows = recordRows([list])
  assert.deepEqual(rows.filter(row => row.best).map(row => row.record.id), ['new2'])
})

test('the best badge is per mode: a recall record competes with recall records only', () => {
  const list = edited()
  list.records.push({ ...record('r1', 30, 90, 12, 29), mode: 'recall' }, { ...record('r2', 25, 95, 12, 29), mode: 'recall' })
  const rows = recordRows([list])
  assert.deepEqual(rows.filter(row => row.best).map(row => row.record.id).sort(), ['new2', 'r2'])
})

test('a list ranking separates other word counts and can include them', () => {
  const list = edited()
  const ranking = listRanking(list, { now })
  assert.deepEqual(ranking.ranked.map(item => item.id), ['new2', 'new3', 'new1'])
  assert.equal(ranking.best.id, 'new2')
  assert.equal(ranking.fallback, false)
  assert.deepEqual(ranking.otherCounts, [{ wordCount: 10, count: 2 }, { wordCount: null, count: 1 }])
  assert.equal(ranking.records.length, 6)
  assert.equal(ranking.lastPracticed.getTime(), Date.parse(at(29)))
  const all = listRanking(list, { now, includeOthers: true })
  assert.deepEqual(all.ranked.map(item => item.id), ['old1', 'new2', 'new3', 'old2', 'new1', 'legacy'])
  assert.deepEqual(listRanking(list, { now, order: 'speed' }).ranked.map(item => item.id), ['new2', 'new1', 'new3'])
})

test('filtering by device ranks only that device, and falls back when it has no run at the current word count', () => {
  const list = edited()
  const onPad = listRanking(list, { now, device: 'pad' })
  assert.deepEqual(onPad.ranked.map(item => item.id), ['new2'])
  assert.deepEqual(onPad.otherCounts, [{ wordCount: 10, count: 1 }])
  const noDevice = listRanking(list, { now, device: NO_DEVICE })
  assert.equal(noDevice.fallback, true)
  assert.deepEqual(noDevice.ranked.map(item => item.id), ['legacy'])
  const missing = listRanking(list, { now, device: 'gone' })
  assert.deepEqual([missing.ranked.length, missing.fallback, missing.lastPracticed, missing.improved], [0, false, null, false])
  assert.equal(matchesDevice(list.records[0], null), true)
})

test('「更新」 marks a best set in the last 7 days that beat an earlier run', () => {
  const list = edited()
  assert.equal(listRanking(list, { now }).improved, true)
  assert.equal(listRanking(list, { now: new Date(2026, 9, 10) }).improved, false, 'older than 7 days')
  const first = { ...list, records: [record('only', 14, 100, 12, 29)] }
  assert.equal(listRanking(first, { now }).improved, false, 'the first run is not an improvement')
})

test('lists sort by last practice, name or record count', () => {
  const a = listRanking({ id: 'a', name: 'いろは', words: words(1), records: [record('a1', 5, 100, 1, 20)] }, { now })
  const b = listRanking({ id: 'b', name: 'あいう', words: words(1), records: [record('b1', 5, 100, 1, 28)] }, { now })
  const c = listRanking({ id: 'c', name: 'Count', words: words(1), records: [record('c1', 5, 100, 1, 10), record('c2', 5, 100, 1, 11)] }, { now })
  const ids = sort => sortRankings([a, b, c], sort).map(item => item.list.id)
  assert.deepEqual(ids('recent'), ['b', 'a', 'c'])
  assert.deepEqual(ids('name'), ['c', 'b', 'a'])
  assert.deepEqual(ids('count'), ['c', 'b', 'a'])
})

test('stats use the latest five runs and the chart the latest twenty, oldest first', () => {
  const records = Array.from({ length: 25 }, (_, index) => record(`r${index}`, 30 - index, index % 2 ? 100 : 90, 5, index + 1))
  const stats = rankingStats(bestRecords(records, Infinity))
  assert.equal(stats.recentCount, 5)
  assert.equal(stats.recentTime, 8)
  assert.equal(stats.recentAccuracy, 94)
  assert.equal(stats.points.length, 20)
  assert.deepEqual([stats.points[0].value, stats.points[19].value], [25, 6])
  const legacy = rankingStats([record('x', 10, undefined, 5, 1)])
  assert.deepEqual([legacy.recentTime, legacy.recentAccuracy, legacy.points.length], [10, null, 1])
  assert.deepEqual(rankingStats([]), { recentCount: 0, recentTime: null, recentAccuracy: null, points: [] })
})

test('device options count by id with the newest name, and put records without a device last', () => {
  const records = [
    record('1', 5, 100, 5, 1, { ...mac, name: 'Old name' }),
    record('2', 5, 100, 5, 2, mac),
    record('3', 5, 100, 5, 3),
    record('4', 5, 100, 5, 4),
    record('5', 5, 100, 5, 5),
    record('6', 5, 100, 5, 6, pad),
  ]
  assert.deepEqual(deviceOptions(records), [
    { value: 'mac', device: mac, count: 2 },
    { value: 'pad', device: pad, count: 1 },
    { value: NO_DEVICE, count: 3 },
  ])
})

test('comparableRecords and listBest compare records of one mode', () => {
  const list = { id: 'm', name: 'M', createdAt: '2026-09-01', words: words(2), records: [
    { ...record('n', 10, 100, 2, 1) }, { ...record('r', 5, 100, 2, 2), mode: 'recall' }] }
  assert.equal(listBest(list).time, 10)
  assert.equal(listBest(list, 'recall').time, 5)
  assert.deepEqual(comparableRecords(list).map(r => r.id), ['n'])
  assert.deepEqual(comparableRecords(list, list.records, 'recall').map(r => r.id), ['r'])
  assert.deepEqual(listRanking(list).ranked.map(r => r.id), ['n'])
})

test('listRanking ranks the chosen mode', () => {
  const list = { id: 'm', name: 'M', createdAt: '2026-09-01', words: words(2), records: [
    { ...record('n', 10, 100, 2, 1) }, { ...record('r', 5, 100, 2, 2), mode: 'recall' }] }
  const ranking = listRanking(list, { mode: 'recall', now })
  assert.deepEqual(ranking.records.map(r => r.id), ['r'])
  assert.deepEqual(ranking.ranked.map(r => r.id), ['r'])
  assert.equal(ranking.best.id, 'r')
})
