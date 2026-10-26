require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { saveList, encodeLists, decodeLists, normalizeLabels, MAX_TAGS } = require('../src/core/wordLists.ts')
const { duplicateList, isFiltered, listLabels, matchesFilter, matchesQuery, NO_FILTER } = require('../src/core/listOverview.ts')
const { validateLists } = require('../src/core/workspaceRequest.ts')
const { initialLists } = require('../src/plugins/packs/index.ts')

const words = [{ display: 'val', input: 'val', annotation: '' }]
const list = (id, name, labels = {}) => ({ id, name, ...labels, words, records: [], createdAt: '2026-10-24T00:00:00.000Z' })

test('the category and tags are saved trimmed, without empty or repeated tags, and left out when there are none', () => {
  assert.deepEqual(normalizeLabels({ category: ' プログラミング ', tags: [' Kotlin', 'kotlin', '', ' ', 'JVM '] }),
    { category: 'プログラミング', tags: ['Kotlin', 'JVM'] })
  assert.deepEqual(normalizeLabels({ category: ' ', tags: [' '] }), {})
  const [saved] = saveList([], list('a', 'Kotlin', { category: ' 語学', tags: ['英語', ' 英語 '] }), false)
  assert.deepEqual([saved.category, saved.tags], ['語学', ['英語']])
  const [cleared] = saveList([saved], { ...saved, category: '', tags: [] }, true)
  assert.equal('category' in cleared, false)
  assert.equal('tags' in cleared, false)
})

test('lists keep their category and tags when saved and read back, and lists without them still read', () => {
  const lists = [list('a', 'A', { category: 'プログラミング', tags: ['Go'] }), list('b', 'B')]
  assert.deepEqual(decodeLists(encodeLists(lists)), lists)
  for (const bad of [{ category: 1 }, { category: null }, { tags: 'Go' }, { tags: ['Go', 2] }, { tags: [null] }]) {
    assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [list('a', 'A', bad)] })), { key: 'savedDataCorrupted' })
  }
})

test('a save refuses a category or tags past their limits', () => {
  validateLists([list('a', 'A', { category: 'c'.repeat(50), tags: Array.from({ length: MAX_TAGS }, (_, n) => `${n}`.padEnd(50, 't')) })])
  assert.throws(() => validateLists([list('a', 'A', { category: 'c'.repeat(51) })]))
  assert.throws(() => validateLists([list('a', 'A', { tags: ['t'.repeat(51)] })]))
  assert.throws(() => validateLists([list('a', 'A', { tags: Array.from({ length: MAX_TAGS + 1 }, (_, n) => `${n}`) })]))
})

test('a copy keeps the category and tags', () => {
  const source = list('a', 'A', { category: 'プログラミング', tags: ['Go'] })
  const { copy } = duplicateList([source], 'a', 'b', n => `（${n}）`)
  assert.deepEqual([copy.category, copy.tags], ['プログラミング', ['Go']])
  assert.notEqual(copy.tags, source.tags)
  assert.equal('category' in duplicateList([list('a', 'A')], 'a', 'b', n => `（${n}）`).copy, false)
})

test('lists are narrowed down by category and every chosen tag, without case, and found by them in a search', () => {
  const go = list('a', 'A', { category: 'プログラミング', tags: ['Go', 'CLI'] })
  const sql = list('b', 'B', { category: 'programming', tags: ['PostgreSQL'] })
  const english = list('c', 'C', { category: '語学' })
  const plain = list('d', 'D')
  const shown = filter => [go, sql, english, plain].filter(item => matchesFilter(item, filter)).map(item => item.id)
  assert.deepEqual(shown(NO_FILTER), ['a', 'b', 'c', 'd'])
  assert.equal(isFiltered(NO_FILTER), false)
  assert.deepEqual(shown({ category: 'Programming', tags: [] }), ['b'])
  assert.deepEqual(shown({ category: '', tags: [] }), ['d'])
  assert.deepEqual(shown({ category: null, tags: ['go', 'cli'] }), ['a'])
  assert.deepEqual(shown({ category: 'プログラミング', tags: ['PostgreSQL'] }), [])
  assert.equal(matchesQuery(go, 'cli'), true)
  assert.equal(matchesQuery(english, '語学'), true)
  assert.equal(matchesQuery(plain, '語学'), false)
})

test('the categories and tags in use are counted once each, in name order', () => {
  const labels = listLabels([list('a', 'A', { category: 'プログラミング', tags: ['Go', 'CLI'] }), list('b', 'B', { category: 'プログラミング ', tags: ['go'] }),
    list('c', 'C', { category: '語学' }), list('d', 'D')])
  assert.deepEqual(labels, {
    categories: [{ name: 'プログラミング', count: 2 }, { name: '語学', count: 1 }],
    tags: [{ name: 'CLI', count: 1 }, { name: 'Go', count: 2 }],
    uncategorized: 1,
  })
})

test('every initial list the sparklingstadt account did not make itself has a category and tags', () => {
  // Since v0.85.0 the initial lists are the lists of the sparklingstadt account. The lists it made itself, and those it
  // kept whole beside their parts, have none.
  const unlabeled = initialLists.filter(item => !item.category && !item.tags)
  assert.deepEqual(unlabeled.map(item => item.id), [...initialLists.slice(0, 9).map(item => item.id), 'arch-linux', 'vim', 'go-syntax', 'un-member-states-chinese-193-lowercase'])
  for (const item of initialLists.filter(item => !unlabeled.includes(item))) {
    assert.ok(['プログラミング', '語学'].includes(item.category), `${item.id}: ${item.category}`)
    assert.ok(item.tags?.length, item.id)
    assert.deepEqual(normalizeLabels(item), { category: item.category, tags: item.tags }, item.id)
  }
  validateLists(initialLists)
})
