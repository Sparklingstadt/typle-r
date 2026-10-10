require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  listSummary, listDetail, findList, decodeNewList, decodeListPatch, createList, updateList, deleteList,
  decodeNewRecord, addApiRecord, selectRecords,
} = require('../src/core/apiRequests.ts')

const word = { display: 'a', input: 'a', annotation: '' }
const record = { id: 'r1', time: 3, date: '2026-10-01', mistakes: 0, accuracy: 100, wordCount: 1 }
const base = { id: 'l1', name: 'l1名', words: [word], records: [record], createdAt: '2026-09-01T00:00:00.000Z', shared: true, shareId: 's1' }
const throwsKey = (fn, k, values) => assert.throws(fn, error => {
  assert.equal(error.key, k)
  if (values) assert.deepEqual(error.values, values)
  return true
})

test('listSummary and listDetail never expose records or the shareId', () => {
  assert.deepEqual(listSummary(base), { id: 'l1', name: 'l1名', wordCount: 1, recordCount: 1, createdAt: base.createdAt, shared: true })
  assert.equal(listSummary({ ...base, shared: undefined, shareId: undefined }).shared, false)
  const detail = listDetail(base, 'https://t.example')
  assert.equal(detail.shareUrl, 'https://t.example/shared/s1')
  assert.deepEqual(detail.words, [word])
  assert.ok(!('records' in detail) && !('shareId' in detail))
  const unshared = listDetail({ ...base, shareId: undefined }, 'https://t.example')
  assert.ok(!('shareUrl' in unshared))
  assert.ok(!('shareUrl' in listDetail({ ...base, shared: undefined }, 'https://t.example')))
})

test('findList throws listNotFound', () => {
  assert.equal(findList([base], 'l1'), base)
  throwsKey(() => findList([base], 'x'), 'listNotFound')
})

test('decodeNewList and decodeListPatch validate the shape', () => {
  assert.equal(decodeNewList({ name: 'A', words: [{ display: 'a', input: 'a' }] }).words[0].annotation, '')
  assert.deepEqual(decodeNewList({ name: 'A', words: [{ display: 'a', input: 'b', annotation: 'c', extra: 1 }] }),
    { name: 'A', words: [{ display: 'a', input: 'b', annotation: 'c' }] })
  for (const value of [null, 'x', { name: 'A' }, { name: 1, words: [] }, { name: 'A', words: 'a' },
    { name: 'A', words: [{ display: 1, input: 'a' }] }, { name: 'A', words: [null] },
    { name: 'A', words: [{ display: 'a', input: 'a', annotation: 1 }] }]) {
    throwsKey(() => decodeNewList(value), 'invalidWorkspace')
  }
  assert.deepEqual(decodeListPatch({ name: 'N' }), { name: 'N' })
  assert.deepEqual(decodeListPatch({ words: [word] }), { words: [word] })
  for (const value of [{}, null, [], { name: 1 }, { words: {} }, { words: [{ display: 1, input: 'a' }] }]) {
    throwsKey(() => decodeListPatch(value), 'invalidWorkspace')
  }
})

test('createList appends a validated list', () => {
  const words = [{ display: 'b', input: 'b', annotation: '' }]
  const result = createList([base], { name: 'B', words }, 'n1', new Date('2026-10-10T00:00:00Z'))
  assert.deepEqual(result.list, { id: 'n1', name: 'B', words, records: [], createdAt: '2026-10-10T00:00:00.000Z' })
  assert.deepEqual(result.lists.map(list => list.id), ['l1', 'n1'])
  assert.equal(result.lists[0], base)
  const now = new Date()
  const make = (name, w = words) => () => createList([base], { name, words: w }, 'n1', now)
  throwsKey(make(' L1名 '), 'listNameDuplicate')
  throwsKey(make('  '), 'listNameRequired')
  throwsKey(make('B', []), 'wordsRequired')
  throwsKey(make('B', [{ display: 'a', input: ' ', annotation: '' }]), 'wordFieldsRequired')
  throwsKey(make('B', Array.from({ length: 1001 }, () => word)), 'invalidWorkspace')
  throwsKey(make('x'.repeat(201)), 'invalidWorkspace')
  const full = Array.from({ length: 100 }, (_, i) => ({ ...base, id: `f${i}`, name: `f${i}`, shareId: undefined }))
  throwsKey(() => createList(full, { name: 'B', words }, 'n1', now), 'listLimit', { max: 100 })
})

test('updateList keeps records, sharing, name and creation date unless changed', () => {
  const w2 = { display: 'b', input: 'b', annotation: '' }
  const replaced = updateList([base], 'l1', { words: [w2] })
  assert.deepEqual(replaced.list.records, [record])
  assert.equal(replaced.list.shared, true)
  assert.equal(replaced.list.shareId, 's1')
  assert.equal(replaced.list.createdAt, base.createdAt)
  assert.equal(replaced.list.name, 'l1名')
  assert.deepEqual(replaced.list.words, [w2])
  assert.equal(replaced.lists[0], replaced.list)
  const renamed = updateList([base], 'l1', { name: 'New' })
  assert.equal(renamed.list.name, 'New')
  assert.deepEqual(renamed.list.words, base.words)
  assert.equal(updateList([base], 'l1', { name: ' L1名 ' }).list.name, 'L1名')
  const other = { ...base, id: 'l2', name: 'two', shared: undefined, shareId: undefined }
  throwsKey(() => updateList([base, other], 'l2', { name: 'L1名' }), 'listNameDuplicate')
  throwsKey(() => updateList([base], 'x', { name: 'N' }), 'listNotFound')
  throwsKey(() => updateList([base], 'l1', { words: [] }), 'wordsRequired')
  throwsKey(() => updateList([base], 'l1', { name: 'x'.repeat(201) }), 'invalidWorkspace')
})

test('deleteList removes one list', () => {
  assert.deepEqual(deleteList([base], 'l1'), [])
  throwsKey(() => deleteList([base], 'x'), 'listNotFound')
})

test('decodeNewRecord validates and normalizes the date', () => {
  const ok = { time: 12.5, date: '2026-10-10T09:00:00+09:00', mistakes: 1, accuracy: 98.5 }
  assert.deepEqual(decodeNewRecord(ok), { ...ok, date: '2026-10-10T00:00:00.000Z' })
  assert.deepEqual(decodeNewRecord({ ...ok, id: 'a_b-1', wordCount: 3, deviceId: 'd1' }),
    { ...ok, date: '2026-10-10T00:00:00.000Z', id: 'a_b-1', wordCount: 3, deviceId: 'd1' })
  for (const bad of [{ time: -1 }, { time: 'x' }, { time: Infinity }, { date: 'abc' }, { date: 5 }, { mistakes: 1.5 }, { mistakes: -1 },
    { accuracy: 101 }, { accuracy: -1 }, { wordCount: 0 }, { wordCount: 1.5 }, { id: 'a b' }, { id: 'a'.repeat(101) }, { id: '' },
    { deviceId: 5 }, { deviceId: '' }]) {
    throwsKey(() => decodeNewRecord({ ...ok, ...bad }), 'invalidRecord')
  }
  for (const bad of [null, 'x', [], { ...ok, time: undefined }, { ...ok, date: undefined }]) {
    throwsKey(() => decodeNewRecord(bad), 'invalidRecord')
  }
})

test('addApiRecord stores the record, the device snapshot and replays by id', () => {
  const lists = [base]
  const input = { time: 5, date: '2026-10-10T00:00:00.000Z', mistakes: 0, accuracy: 100 }
  const plain = addApiRecord(lists, 'l1', input, [], 'n1')
  assert.equal(plain.created, true)
  assert.equal(plain.record.id, 'n1')
  assert.equal(plain.record.wordCount, 1)
  assert.ok(!('device' in plain.record))
  assert.deepEqual(plain.lists[0].records, [record, plain.record])
  assert.equal(addApiRecord(lists, 'l1', { ...input, wordCount: 7, id: 'mine' }, [], 'n1').record.wordCount, 7)
  assert.equal(addApiRecord(lists, 'l1', { ...input, id: 'mine' }, [], 'n1').record.id, 'mine')

  const device = { id: 'd1', name: 'Mac', layout: 'JIS' }
  const withDevice = addApiRecord(lists, 'l1', { ...input, deviceId: 'd1' }, [device], 'n1')
  assert.deepEqual(withDevice.record.device, device)
  assert.notEqual(withDevice.record.device, device)
  throwsKey(() => addApiRecord(lists, 'l1', { ...input, deviceId: 'zz' }, [device], 'n1'), 'deviceNotFound')

  const replay = addApiRecord(lists, 'l1', { ...input, id: 'r1', time: 99 }, [], 'n1')
  assert.equal(replay.created, false)
  assert.equal(replay.record, record)
  assert.equal(replay.lists, lists)

  const many = [{ ...base, records: Array.from({ length: 10000 }, (_, i) => ({ ...record, id: `r${i}` })) }]
  throwsKey(() => addApiRecord(many, 'l1', input, [], 'n1'), 'invalidRecord')
  assert.equal(addApiRecord(many, 'l1', { ...input, id: 'r5' }, [], 'n1').created, false)
  throwsKey(() => addApiRecord(lists, 'x', input, [], 'n1'), 'listNotFound')
})

test('selectRecords sorts newest first and filters by since and limit', () => {
  const list = { ...base, records: [
    { id: 'a', time: 1, date: '2026-10-01', mistakes: 0, accuracy: 100, wordCount: 1 },
    { time: 2, date: '2026-10-03' },
    { id: 'c', time: 3, date: '2026-10-02', mistakes: 0, accuracy: 90, wordCount: 1 },
  ] }
  const dates = query => selectRecords(list, new URLSearchParams(query)).map(r => r.date)
  assert.deepEqual(dates(''), ['2026-10-03', '2026-10-02', '2026-10-01'])
  assert.deepEqual(dates('since=2026-10-02T00:00:00Z'), ['2026-10-03'])
  assert.deepEqual(dates('limit=1'), ['2026-10-03'])
  assert.deepEqual(dates('limit=1000'), ['2026-10-03', '2026-10-02', '2026-10-01'])
  for (const bad of ['since=abc', 'since=', 'limit=0', 'limit=1001', 'limit=1.5', 'limit=x', 'limit=', 'limit=-1']) {
    throwsKey(() => selectRecords(list, new URLSearchParams(bad)), 'invalidQuery')
  }
  assert.equal(list.records[0].date, '2026-10-01')
})
