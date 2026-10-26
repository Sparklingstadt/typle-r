require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { listRanking } = require('../src/core/rankings.ts')
const { packRankings, sortPackRankings, matchesRankingQuery, packRecordOptions } = require('../src/core/packRecords.ts')

const stamp = '2026-10-01T00:00:00.000Z'
const now = new Date('2026-10-20T00:00:00.000Z')
const words = [{ display: 'ls', input: 'ls', annotation: '' }]
const run = (id, date, extra = {}) => ({ id, time: 5, date, accuracy: 100, wordCount: 1, ...extra })
const list = (id, packId, records = [], extra = {}) => ({ id, name: id, packId, words, records, createdAt: stamp, ...extra })
const pack = (id, name = id) => ({ id, name, createdAt: stamp })
const rank = (lists, device = null) => lists.map(item => listRanking(item, { device, now }))

const lists = [
  list('a', 'p', [run('a1', '2026-10-02T00:00:00.000Z'), run('a2', '2026-10-03T00:00:00.000Z')]),
  list('b', 'p'),
  // Best set 2 days ago, with an older run before it.
  list('c', 'q', [run('c1', '2026-10-10T00:00:00.000Z', { accuracy: 90 }), run('c2', '2026-10-18T00:00:00.000Z')]),
]

test('packRankings totals the lists of each pack in saved order and skips packs without lists', () => {
  const result = packRankings([pack('p'), pack('empty'), pack('q')], rank(lists))
  assert.deepEqual(result.map(item => item.pack.id), ['p', 'q'])
  const [p, q] = result
  assert.deepEqual(p.items.map(item => item.list.id), ['a', 'b'])
  assert.equal(p.practiceCount, 2)
  assert.equal(p.practicedListCount, 1)
  assert.equal(p.lastPracticed.toISOString(), '2026-10-03T00:00:00.000Z')
  assert.equal(p.improvedCount, 0)
  assert.equal(q.practiceCount, 2)
  assert.equal(q.improvedCount, 1)
})

test('packRankings counts only the records of the chosen device', () => {
  const mac = { id: 'mac', name: 'Mac', layout: 'JIS' }
  const own = [list('a', 'p', [run('a1', '2026-10-02T00:00:00.000Z', { device: mac }), run('a2', '2026-10-03T00:00:00.000Z')])]
  const [p] = packRankings([pack('p')], rank(own, 'mac'))
  assert.equal(p.practiceCount, 1)
  assert.equal(p.lastPracticed.toISOString(), '2026-10-02T00:00:00.000Z')
  const [none] = packRankings([pack('p')], rank(own, 'other'))
  assert.equal(none.practiceCount, 0)
  assert.equal(none.practicedListCount, 0)
  assert.equal(none.lastPracticed, null)
})

test('sortPackRankings orders by recent, name and count, then by saved order', () => {
  const ranked = packRankings([pack('p', 'Zeta'), pack('q', 'Alpha'), pack('r', 'Mid'), pack('s', 'Idle')], rank([
    ...lists,
    list('d', 'r', [run('d1', '2026-10-15T00:00:00.000Z'), run('d2', '2026-10-16T00:00:00.000Z')]),
    list('e', 's'),
  ]))
  const ids = sort => sortPackRankings(ranked, sort, 'en').map(item => item.pack.id)
  // q (10-18) > r (10-16) > p (10-03) > s (never practised)
  assert.deepEqual(ids('recent'), ['q', 'r', 'p', 's'])
  assert.deepEqual(ids('name'), ['q', 's', 'r', 'p'])
  // p, q and r all have 2 runs: recent breaks the tie.
  assert.deepEqual(ids('count'), ['q', 'r', 'p', 's'])
  // Equal in every respect: saved order stays.
  const idle = packRankings([pack('x'), pack('y')], rank([list('l1', 'x'), list('l2', 'y')]))
  assert.deepEqual(sortPackRankings(idle, 'recent').map(item => item.pack.id), ['x', 'y'])
  assert.deepEqual(sortPackRankings(idle, 'count').map(item => item.pack.id), ['x', 'y'])
})

test('matchesRankingQuery matches the pack name for all lists and a list name for that list', () => {
  const [item] = packRankings([pack('p', 'Linux Basics')], rank([list('a', 'p', [], { name: 'Files' }), list('b', 'p', [], { name: 'Network' })]))
  assert.deepEqual(matchesRankingQuery(item, 'linux'), ['a', 'b'])
  assert.deepEqual(matchesRankingQuery(item, 'NETW'), ['b'])
  assert.deepEqual(matchesRankingQuery(item, 'zzz'), [])
})

test('matchesRankingQuery also matches the level name shown on grouped rows', () => {
  const [item] = packRankings([pack('p', 'Linux')], rank([list('a', 'p', [], { name: 'Files', levels: ['Easy', 'Short'] }), list('b', 'p', [], { name: 'Network' })]))
  assert.deepEqual(matchesRankingQuery(item, 'short'), ['a'])
  assert.deepEqual(matchesRankingQuery(item, 'network'), ['b'])
})

test('packRecordOptions lists only packs with records, in saved order, counting their records', () => {
  const options = packRecordOptions([pack('q', 'Q'), pack('empty'), pack('p', 'P')], lists)
  assert.deepEqual(options, [{ value: 'q', label: 'Q', count: 2 }, { value: 'p', label: 'P', count: 2 }])
})

test('packRecordOptions keeps the selected pack even without records', () => {
  const options = packRecordOptions([pack('q', 'Q'), pack('empty', 'E')], lists, 'empty')
  assert.deepEqual(options, [{ value: 'q', label: 'Q', count: 2 }, { value: 'empty', label: 'E', count: 0 }])
})
