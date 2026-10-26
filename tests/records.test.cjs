require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { newSession, typeInput } = require('../src/core/typing.ts')
const { makeRecord, addRecord } = require('../src/core/records.ts')
const { encodeLists, decodeLists, saveList } = require('../src/core/wordLists.ts')

test('completed records survive reload and editing; retry never duplicates', () => {
  const list = { id: 'a', name: 'Test', words: [{ display: 'ab', input: 'ab', annotation: '' }], records: [], createdAt: '2026-09-06' }
  let s = typeInput(newSession(), list.words, 'a', 1000)
  s = typeInput(s, list.words, 'ab', 3000)
  const record = makeRecord(s, 1, 'run-1')
  let lists = addRecord([list], 'a', record)
  lists = addRecord(lists, 'a', record)
  lists = saveList(lists, { ...list, words: [...list.words, ...list.words] }, true)
  const restored = decodeLists(encodeLists(lists))
  assert.equal(restored[0].records.length, 1)
  assert.equal(restored[0].records[0].wordCount, 1)
  assert.equal(restored[0].records[0].time, 2)
  assert.deepEqual(decodeLists(encodeLists(restored.map(l => ({ ...l, records: l.records.filter(r => r.id !== record.id) }))))[0].records, [])
  assert.throws(() => addRecord([], 'a', record))
  assert.throws(() => makeRecord(newSession(), 1, 'incomplete'))
})

const { recordRows, filterRows, groupByDay, recordTimeParts, secondsPerWord, formatAccuracy, NO_DEVICE } = require('../src/core/records.ts')
const mac = { id: 'mac', name: 'MacBook Air', layout: 'JIS' }
// Local-time dates, so day grouping does not depend on the machine's time zone.
const at = (day, hour) => new Date(2026, 8, day, hour).toISOString()
const historyLists = () => [
  { id: 'a', name: 'A', createdAt: '2026-09-01', words: [], records: [
    { id: 'a1', time: 5, date: at(28, 9), mistakes: 1, accuracy: 95, wordCount: 5, device: mac },
    { id: 'a2', time: 4, date: at(29, 20), mistakes: 0, accuracy: 100, wordCount: 5, device: { ...mac, name: 'Old name' } },
    { time: 3, date: at(27, 8) },
  ] },
  { id: 'b', name: 'B', createdAt: '2026-09-01', words: [], records: [
    { id: 'b1', time: 70, date: at(29, 10), mistakes: 2, accuracy: 90, wordCount: 20 },
  ] },
]

test('record rows are newest first and mark the current best of each list', () => {
  const rows = recordRows(historyLists())
  assert.deepEqual(rows.map(row => row.key), ['a-a2', 'b-b1', 'a-a1', 'a-2-' + at(27, 8)])
  // Accuracy ranks first, so the older 3-second run without accuracy is not the best.
  assert.deepEqual(rows.filter(row => row.best).map(row => row.key), ['a-a2', 'b-b1'])
})

test('filters match lists and devices by id, including records without a device', () => {
  const rows = recordRows(historyLists())
  assert.deepEqual(filterRows(rows, { pack: null, list: 'a', device: null }).map(row => row.key), ['a-a2', 'a-a1', 'a-2-' + at(27, 8)])
  // The device was renamed between runs; both records still belong to it.
  assert.deepEqual(filterRows(rows, { pack: null, list: null, device: 'mac' }).map(row => row.key), ['a-a2', 'a-a1'])
  assert.deepEqual(filterRows(rows, { pack: null, list: null, device: NO_DEVICE }).map(row => row.key), ['b-b1', 'a-2-' + at(27, 8)])
  assert.deepEqual(filterRows(rows, { pack: null, list: 'b', device: 'mac' }), [])
})

test('filters narrow by pack, alone and together with a list or a device', () => {
  const lists = historyLists().map(list => ({ ...list, packId: list.id === 'a' ? 'p' : 'q' }))
  const rows = recordRows(lists)
  assert.deepEqual(filterRows(rows, { pack: 'p', list: null, device: null }).map(row => row.key), ['a-a2', 'a-a1', 'a-2-' + at(27, 8)])
  assert.deepEqual(filterRows(rows, { pack: 'q', list: 'b', device: null }).map(row => row.key), ['b-b1'])
  assert.deepEqual(filterRows(rows, { pack: 'q', list: 'a', device: null }), [])
  assert.deepEqual(filterRows(rows, { pack: 'p', list: null, device: 'mac' }).map(row => row.key), ['a-a2', 'a-a1'])
})

test('rows are grouped by local day with the practice time of each day', () => {
  const groups = groupByDay(recordRows(historyLists()))
  assert.deepEqual(groups.map(group => [group.day.getDate(), group.rows.length, group.seconds]), [[29, 2, 74], [28, 1, 5], [27, 1, 3]])
})

test('times keep hundredths and split minutes without showing 60 seconds', () => {
  assert.deepEqual(recordTimeParts(3.021), [['3.02', 'seconds']])
  assert.deepEqual(recordTimeParts(59.999), [['1', 'minutes'], ['00.00', 'seconds']])
  assert.deepEqual(recordTimeParts(128.89), [['2', 'minutes'], ['08.89', 'seconds']])
  assert.deepEqual(recordTimeParts(476.85), [['7', 'minutes'], ['56.85', 'seconds']])
})

test('per-word speed and accuracy fall back to a dash for older records', () => {
  assert.equal(secondsPerWord({ time: 70, date: at(29, 10), wordCount: 20 }), 3.5)
  assert.equal(secondsPerWord({ time: 3, date: at(27, 8) }), null)
  assert.equal(formatAccuracy(90.17), '90.2%')
  assert.equal(formatAccuracy(100), '100%')
  assert.equal(formatAccuracy(undefined), '—')
})

test('lists to choose from put the most recently practised first and keep the saved order for the rest', () => {
  const { byRecentPractice } = require('../src/core/records.ts')
  const list = (id, ...dates) => ({ id, records: dates.map(date => ({ date })) })
  const lists = [list('a'), list('b', '2026-10-01T00:00:00Z'), list('c'), list('d', '2026-09-01T00:00:00Z', '2026-10-05T00:00:00Z'), list('e', 'not a date')]
  assert.deepEqual(byRecentPractice(lists).map(item => item.id), ['d', 'b', 'a', 'c', 'e'])
  assert.deepEqual(lists.map(item => item.id), ['a', 'b', 'c', 'd', 'e'])
})
