require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { listOverviews, sortOverviews, matchesQuery, wordPreview, currentRecordCount, copyName, duplicateList, MAX_LISTS } = require('../src/core/listOverview.ts')

const words = (...texts) => texts.map(text => ({ display: text, input: text.toLowerCase(), annotation: '' }))
const record = (date, wordCount) => ({ time: 5, date, ...(wordCount ? { wordCount } : {}) })
const lists = () => [
  { id: 'a', name: 'Test 10', createdAt: '2024/09/22 10:00', words: words('あ', 'い'), records: [record('2026-09-20T10:00:00Z', 2), record('2026-09-28T10:00:00Z', 2)] },
  { id: 'b', name: 'Test 2', createdAt: '2024/09/22 10:00', words: words('Apple', 'Banana', 'Cherry'), records: [] },
  { id: 'c', name: '英単語', createdAt: '2026-09-01', words: words('kiwi'), records: [record('2026-09-29T08:00:00Z', 1), record('not a date', 1)] },
]

test('overviews count practice and find the latest valid date', () => {
  const [a, b, c] = listOverviews(lists())
  assert.deepEqual([a.position, a.practiceCount, a.lastPracticed], [0, 2, Date.parse('2026-09-28T10:00:00Z')])
  assert.deepEqual([b.practiceCount, b.lastPracticed], [0, null])
  assert.equal(c.lastPracticed, Date.parse('2026-09-29T08:00:00Z'))
})

test('orders: newest added first, recently practised with unpractised last, natural name order, most words', () => {
  const items = listOverviews(lists())
  const ids = order => sortOverviews(items, order).map(item => item.list.id)
  assert.deepEqual(ids('added'), ['c', 'b', 'a'])
  assert.deepEqual(ids('practiced'), ['c', 'a', 'b'])
  assert.deepEqual(ids('name'), ['b', 'a', 'c'], 'Test 2 comes before Test 10')
  assert.deepEqual(ids('words'), ['b', 'a', 'c'])
  assert.deepEqual(items.map(item => item.list.id), ['a', 'b', 'c'], 'sorting leaves the saved order alone')
})

test('search matches the name and the words, ignoring case', () => {
  const [a, b, c] = lists()
  assert.ok(matchesQuery(b, 'banana'))
  assert.ok(matchesQuery(b, 'TEST'))
  assert.ok(matchesQuery(c, 'KIWI'))
  assert.ok(!matchesQuery(a, 'kiwi'))
  assert.ok(matchesQuery(a, '  '))
})

test('preview shows the first words and how many more there are', () => {
  assert.deepEqual(wordPreview(lists()[1]), { words: ['Apple', 'Banana', 'Cherry'], rest: 0 })
  assert.deepEqual(wordPreview(lists()[1], 2), { words: ['Apple', 'Banana'], rest: 1 })
})

test('only runs at the current word count count towards the best', () => {
  const list = { words: words('a', 'b', 'c'), records: [record('2026-09-01', 3), record('2026-09-02', 2), record('2026-09-03')] }
  assert.equal(currentRecordCount(list), 1)
})

test('a copy gets a free name, the same words and no records', () => {
  const current = lists()
  const suffix = n => n === 1 ? '（コピー）' : `（コピー${n}）`
  assert.equal(copyName(current, 'Test 2', suffix), 'Test 2（コピー）')
  assert.equal(copyName([...current, { ...current[1], id: 'x', name: 'test 2（コピー）' }], 'Test 2', suffix), 'Test 2（コピー2）')
  assert.equal(copyName(current, 'x'.repeat(200), suffix).length, 200)
  assert.equal(copyName(current, 'Test 2', n => ` (copy ${n})`), 'Test 2 (copy 1)')
  const now = new Date('2026-09-29T12:00:00Z')
  const { lists: next, copy } = duplicateList(current, 'a', 'copy', suffix, now)
  assert.deepEqual(next.map(list => list.id), ['a', 'b', 'c', 'copy'])
  assert.deepEqual(copy, { id: 'copy', name: 'Test 10（コピー）', createdAt: now.toISOString(), words: current[0].words, records: [] })
  assert.notEqual(copy.words[0], current[0].words[0], 'words are copied, not shared')
  assert.throws(() => duplicateList(current, 'missing', 'copy', suffix), { key: 'listDeleted' })
  const full = Array.from({ length: MAX_LISTS }, (_, index) => ({ ...current[1], id: `l${index}`, name: `l${index}` }))
  assert.throws(() => duplicateList(full, 'l0', 'copy', suffix), { key: 'listLimit', values: { max: 150 } })
})

test('a copy of a shared list is not shared', () => {
  const current = lists().map((list, index) => index ? list : { ...list, shared: true, shareId: 'x' })
  const { copy } = duplicateList(current, 'a', 'copy', n => `（${n}）`)
  assert.equal('shared' in copy, false)
  assert.equal('shareId' in copy, false)
})
