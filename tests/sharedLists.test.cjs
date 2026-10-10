require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isShareId, decodeSharedList, copySharedList, sharedKeys, stripShareIds } = require('../src/core/sharedLists.ts')
const { MAX_LISTS } = require('../src/core/listOverview.ts')

const uuid = '0b7c6f0e-9d2a-4a3b-8c1d-2e3f4a5b6c7d'
const words = [{ display: 'a', input: 'a', annotation: '' }]
const shared = { name: 'N', words, updatedAt: '2026-10-10T00:00:00.000Z' }
const suffix = n => n === 1 ? '（コピー）' : `（コピー${n}）`
const list = (id, extra = {}) => ({ id, name: id, createdAt: '2026-09-06', words, records: [], ...extra })

test('share ids are UUIDs', () => {
  assert.equal(isShareId(uuid), true)
  assert.equal(isShareId(uuid.toUpperCase()), true)
  for (const value of ['sample-1', '', 123, uuid + 'x', undefined]) assert.equal(isShareId(value), false)
})

test('a shared list from the server is checked', () => {
  assert.deepEqual(decodeSharedList(shared), shared)
  for (const value of [null, { ...shared, words: 'a' }, { ...shared, name: 1 }, { name: 'N', words }, { ...shared, words: [{ display: 'a' }] }]) {
    assert.throws(() => decodeSharedList(value), { key: 'invalidServerData' })
  }
})

test('a copy of a shared list is a new list without records or sharing', () => {
  const now = new Date('2026-10-10T00:00:00Z')
  const { lists, copy } = copySharedList([], shared, 'c1', suffix, now)
  assert.deepEqual(copy, { id: 'c1', name: 'N', createdAt: '2026-10-10T00:00:00.000Z', words, records: [] })
  assert.deepEqual(lists, [copy])
  assert.notEqual(copy.words[0], words[0], 'words are copied, not shared')
  const second = copySharedList(lists, shared, 'c2', suffix, now)
  assert.equal(second.copy.name, 'N（コピー）')
  assert.equal(copySharedList(second.lists, shared, 'c3', suffix, now).copy.name, 'N（コピー2）')
  const full = Array.from({ length: MAX_LISTS }, (_, index) => list(`l${index}`))
  assert.throws(() => copySharedList(full, shared, 'c', suffix), { key: 'listLimit', values: { max: 100 } })
})

test('shared keys and stripping share ids', () => {
  assert.deepEqual(sharedKeys([list('a', { shared: true }), list('b')]), ['a'])
  assert.deepEqual(stripShareIds([list('a', { shared: true, shareId: uuid }), list('b')]), [list('a', { shared: true }), list('b')])
})
