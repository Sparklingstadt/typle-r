require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeLibrary, decodePacks, validateLibrary } = require('../src/core/wordPacks.ts')
const { decodeLists, saveList } = require('../src/core/wordLists.ts')

const dir = path.join(__dirname, 'fixtures/packs')
for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
  test(`fixture ${file}`, () => {
    const { lists, packs, expected } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const result = normalizeLibrary(lists, packs)
    assert.deepEqual(result, expected)
    validateLibrary(result)
    // 変換・補正した結果をもう一度かけても変わらない。
    assert.deepEqual(normalizeLibrary(result.lists, result.packs), result)
  })
}

test('packs keep fields Typle does not know and refuse wrong shapes', () => {
  const pack = { id: 'p', name: 'P', createdAt: '2026-10-01T00:00:00.000Z', future: 1 }
  assert.deepEqual(decodePacks([pack]), [pack])
  for (const bad of [null, {}, [{ ...pack, id: 1 }], [{ ...pack, tags: 'x' }], [pack, pack]]) {
    assert.throws(() => decodePacks(bad), { key: 'savedDataCorrupted' })
  }
})

test('validateLibrary refuses what a save must not contain', () => {
  const list = { id: 'a', name: 'a', packId: 'p', words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: '2026-10-01T00:00:00.000Z' }
  const pack = { id: 'p', name: 'P', createdAt: '2026-10-01T00:00:00.000Z' }
  validateLibrary({ packs: [pack], lists: [list] })
  for (const library of [
    { packs: [pack], lists: [{ ...list, packId: 'q' }] },                      // 存在しないパック
    { packs: [pack, { ...pack, id: 'q' }], lists: [list] },                     // 空のパック・同じ名前
    { packs: [{ ...pack, name: ' ' }], lists: [list] },
    { packs: [{ ...pack, name: 'n'.repeat(201) }], lists: [list] },
    { packs: [{ ...pack, description: 'd'.repeat(501) }], lists: [list] },
    { packs: [pack], lists: [list, { ...list, id: 'b', name: 'A' }] },          // パック内で同じ名前
    { packs: [pack], lists: [{ ...list, category: 'c' }] },                     // 保存の形でない
  ]) assert.throws(() => validateLibrary(library))
})

test('lists keep a packId and refuse one that is not a string', () => {
  const list = { id: 'a', name: 'a', packId: 'p', words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: '2026-10-01T00:00:00.000Z' }
  assert.equal(decodeLists(JSON.stringify({ version: 1, lists: [list] }))[0].packId, 'p')
  assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, packId: 1 }] })), { key: 'savedDataCorrupted' })
  assert.equal(saveList([list], { ...list, name: 'b' }, true)[0].packId, 'p')
})
