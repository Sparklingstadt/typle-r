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
test('decodeLists drops sharing fields saved by older versions', () => {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, shared: true, shareId: 'x' }, { ...list, id: 'b', name: 'Second', shared: 'yes' }] }))
  assert.deepEqual(lists.map(item => item.id), ['a', 'b'])
  for (const item of lists) {
    assert.equal('shared' in item, false)
    assert.equal('shareId' in item, false)
  }
})
