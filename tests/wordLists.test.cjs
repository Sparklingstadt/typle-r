require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { saveList, encodeLists, decodeLists } = require('../src/core/wordLists.ts')
const list = { id: 'a', name: 'First', words: [{ display: 'one', input: 'one', annotation: '' }], records: [], createdAt: '2026-09-06' }

test('create, edit, reorder, delete and reload lists', () => {
  let lists = saveList([], list, false)
  lists = saveList(lists, { ...list, name: 'Renamed', words: [list.words[0], { ...list.words[0], input: 'two' }].reverse() }, true)
  const loaded = decodeLists(encodeLists(lists))
  assert.equal(loaded[0].name, 'Renamed')
  assert.equal(loaded[0].words[0].input, 'two')
  assert.deepEqual(decodeLists(encodeLists(loaded.filter(x => x.id !== 'a'))), [])
})
test('reject invalid, duplicate, deleted and corrupt data', () => {
  assert.throws(() => saveList([], { ...list, name: ' ' }, false))
  assert.throws(() => saveList([], { ...list, words: [] }, false))
  assert.throws(() => saveList([list], { ...list, id: 'b', name: ' first ' }, false))
  assert.throws(() => saveList([], list, true))
  assert.throws(() => decodeLists('{oops'))
  assert.throws(() => decodeLists('{"version":2,"lists":[]}'))
  assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [list, list] })))
})
test('sharing is kept on lists and survives edits', () => {
  const uuid = '0b7c6f0e-9d2a-4a3b-8c1d-2e3f4a5b6c7d'
  assert.equal(decodeLists(encodeLists([{ ...list, shared: true, shareId: uuid }]))[0].shared, true)
  for (const extra of [{ shared: false }, { shared: 'yes' }, { shareId: 1 }]) {
    assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, ...extra }] })), { key: 'savedDataCorrupted' })
  }
  assert.equal(saveList([{ ...list, shared: true }], { ...list, name: 'New' }, true)[0].shared, true)
  assert.equal(saveList([list], { ...list, name: 'New' }, true)[0].shared, undefined)
})
