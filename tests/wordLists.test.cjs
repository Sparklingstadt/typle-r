require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { saveList, encodeLists, decodeLists, validateList } = require('../src/core/wordLists.ts')
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

test('word input types survive save and reload while legacy words remain unchanged', () => {
  const words = ['command', 'code', 'word'].map(input_type => ({ ...list.words[0], input_type }))
  words.push({ ...list.words[0] })
  const saved = saveList([], { ...list, words }, false)
  assert.deepEqual(decodeLists(encodeLists(saved))[0].words, words)
  assert.equal('input_type' in decodeLists(encodeLists([list]))[0].words[0], false)
})

test('word input types reject invalid strings, null and non-string values', () => {
  const { isInputType, validateList } = require('../src/core/wordLists.ts')
  for (const value of ['command', 'code', 'word']) assert.equal(isInputType(value), true)
  for (const input_type of ['', 'other', 'Code', null, 1, false, {}, []]) {
    assert.equal(isInputType(input_type), false)
    const invalid = { ...list, words: [{ ...list.words[0], input_type }] }
    assert.throws(() => validateList(invalid), { key: 'savedDataCorrupted' })
    assert.throws(() => saveList([], invalid, false), { key: 'savedDataCorrupted' })
    assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [invalid] })), { key: 'savedDataCorrupted' })
  }
})

test('writing is kept, checked and optional', () => {
  const marked = { ...list, writing: { language: 'zh-Hans' } }
  assert.deepEqual(decodeLists(encodeLists([marked]))[0].writing, { language: 'zh-Hans' })
  assert.equal('writing' in decodeLists(encodeLists([list]))[0], false)
  for (const writing of [{ language: 'xx' }, { language: 'ja', extra: 1 }, 'ja', null, [], {}]) {
    assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, writing }] })), { key: 'savedDataCorrupted' })
    assert.throws(() => validateList({ ...list, writing }), { key: 'invalidWritingLanguage' })
  }
  validateList(marked)
})
