require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { newSession, typeInput } = require('../src/core/typing.ts')
const { makeRecord, addRecord, deleteRecord, recordMode } = require('../src/core/records.ts')
const { encodeLists, decodeLists, saveList } = require('../src/core/wordLists.ts')

test('completed records survive reload and editing; retry never duplicates', () => {
  const list = { id: 'a', name: 'Test', words: [{ display: 'ab', input: 'ab', annotation: '' }], records: [], createdAt: '2026-09-06' }
  let s = typeInput(newSession(), list.words, 'a', 1000)
  s = typeInput(s, list.words, 'ab', 3000)
  const record = makeRecord(s, 1, 'run-1')
  const add = lists => addRecord({ lists, devices: [] }, 'a', record).document.lists
  let lists = add([list])
  lists = add(lists)
  lists = saveList(lists, { ...list, words: [...list.words, ...list.words] }, true)
  const restored = decodeLists(encodeLists(lists))
  assert.equal(restored[0].records.length, 1)
  assert.equal(restored[0].records[0].wordCount, 1)
  assert.equal(restored[0].records[0].time, 2)
  assert.deepEqual(decodeLists(encodeLists(restored.map(l => ({ ...l, records: l.records.filter(r => r.id !== record.id) }))))[0].records, [])
  assert.throws(() => addRecord({ lists: [], devices: [] }, 'a', record), { key: 'recordListDeleted' })
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

// The fixtures are shared with server/internal/workspace/records_test.go, so the guest's workspace adds a run as the account's does.
const fs = require('node:fs')
const path = require('node:path')
const recordFixtures = path.join(__dirname, 'fixtures', 'records')
for (const file of fs.readdirSync(recordFixtures).filter(name => name.endsWith('.json'))) {
  test(`add-record fixture ${file}`, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(recordFixtures, file), 'utf8'))
    const run = () => addRecord({ lists: fixture.lists, devices: fixture.devices }, fixture.listId, fixture.input)
    if (fixture.expected.error) {
      const key = fixture.expected.error === 'listNotFound' ? 'recordListDeleted' : fixture.expected.error
      assert.throws(run, { key })
      return
    }
    const { document, record, added } = run()
    assert.equal(added, fixture.expected.added)
    assert.deepEqual(record, fixture.expected.record)
    const saved = document.lists.find(list => list.id === fixture.listId).records
    assert.deepEqual(saved.at(-1), fixture.expected.record)
    assert.equal(saved.length, fixture.lists.find(list => list.id === fixture.listId).records.length + (added ? 1 : 0))
  })
}

test('deleteRecord removes the run of that id only, and a run or list already gone changes nothing', () => {
  const list = { id: 'a', name: 'A', createdAt: '2026-10-01', words: [], records: [
    { id: 'r1', time: 1, date: '2026-10-01T00:00:00.000Z' }, { time: 2, date: '2026-10-02T00:00:00.000Z' }, { id: 'r2', time: 3, date: '2026-10-03T00:00:00.000Z' }] }
  const document = { lists: [list], devices: [] }
  const { document: after, deleted } = deleteRecord(document, 'a', 'r1')
  assert.equal(deleted, true)
  assert.deepEqual(after.lists[0].records.map(record => record.time), [2, 3])
  assert.equal(document.lists[0].records.length, 3)
  for (const [listId, recordId] of [['a', 'gone'], ['gone', 'r1'], ['a', '']]) {
    const result = deleteRecord(document, listId, recordId)
    assert.equal(result.deleted, false)
    assert.equal(result.document, document)
  }
})

// The fixtures are shared with server/internal/workspace/records_test.go: the same steps leave the same records in the app and in Go.
const operationFixtures = path.join(__dirname, 'fixtures', 'record-operations')
for (const file of fs.readdirSync(operationFixtures).filter(name => name.endsWith('.json'))) {
  test(`record operations fixture ${file}`, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(operationFixtures, file), 'utf8'))
    let document = { lists: fixture.lists, devices: fixture.devices }
    fixture.steps.forEach((step, i) => {
      if (step.op === 'add') {
        if (step.expected.error) {
          const key = step.expected.error === 'listNotFound' ? 'recordListDeleted' : step.expected.error
          assert.throws(() => addRecord(document, step.listId, step.input), { key }, `step ${i}`)
          return
        }
        const result = addRecord(document, step.listId, step.input)
        assert.equal(result.added, step.expected.added, `step ${i}`)
        document = result.document
      } else if (step.op === 'delete') {
        const result = deleteRecord(document, step.listId, step.recordId)
        assert.equal(result.deleted, step.expected.deleted, `step ${i}`)
        document = result.document
      } else {
        assert.fail(`step ${i}: unknown op ${step.op}`)
      }
    })
    for (const [listId, records] of Object.entries(fixture.expected)) {
      assert.deepEqual(document.lists.find(list => list.id === listId).records, records, listId)
    }
  })
}

test('makeRecord marks a writing run; typing runs have no mode key', () => {
  const words = [{ display: 'ab', input: 'ab', annotation: '' }]
  const s = typeInput(typeInput(newSession(), words, 'a', 1000), words, 'ab', 3000)
  assert.equal(makeRecord(s, 2, 'w1', undefined, 'writing').mode, 'writing')
  assert.equal('mode' in makeRecord(s, 2, 'w2'), false)
  assert.equal(recordMode({ mode: 'writing' }), 'writing')
  assert.equal(recordMode({}), 'typing')
})

test('decodeLists refuses a stored record whose mode is not writing', () => {
  const list = { id: 'a', name: 'A', createdAt: '2026-10-01', words: [{ display: 'ab', input: 'ab', annotation: '' }], records: [] }
  const decode = mode => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, records: [{ id: 'r', time: 1, date: '2026-10-01T00:00:00.000Z', mode }] }] }))
  assert.equal(decode('writing')[0].records[0].mode, 'writing')
  for (const mode of ['typing', '', 1, null]) assert.throws(() => decode(mode), { key: 'savedDataCorrupted' })
})

test('record rows carry the mode, and each mode has its own best', () => {
  const words = [{ display: 'a', input: 'a', annotation: '' }]
  const rec = (id, time, extra = {}) => ({ id, time, date: `2026-09-2${id.length}T10:00:00Z`, mistakes: 0, accuracy: 100, wordCount: 1, ...extra })
  const rows = recordRows([{ id: 'l', name: 'l', createdAt: '2026-09-01', words, records: [rec('a', 10), rec('bb', 12), rec('ccc', 5, { mode: 'writing' })] }])
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map(row => [row.record.id, row.mode, row.best]), [['ccc', 'writing', true], ['bb', 'typing', false], ['a', 'typing', true]])
})
