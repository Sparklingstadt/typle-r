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
  const many = Array.from({ length: 151 }, (_, i) => i)
  const cases = {
    'a list in a pack that does not exist': { packs: [pack, { ...pack, id: 'q', name: 'Q' }], lists: [{ ...list, packId: 'r' }, { ...list, id: 'b', name: 'b', packId: 'q' }, { ...list, id: 'c', name: 'c' }] },
    'a list without a packId': { packs: [pack], lists: [list, { ...list, id: 'b', name: 'b', packId: undefined }] },
    'a pack without lists': { packs: [pack, { ...pack, id: 'q', name: 'Q' }], lists: [list] },
    'two packs with one name': { packs: [pack, { ...pack, id: 'q', name: ' p ' }], lists: [list, { ...list, id: 'b', name: 'b', packId: 'q' }] },
    'two packs with one id': { packs: [pack, { ...pack, name: 'Q' }], lists: [list] },
    'a blank pack name': { packs: [{ ...pack, name: ' ' }], lists: [list] },
    'a pack name over the limit': { packs: [{ ...pack, name: 'n'.repeat(201) }], lists: [list] },
    'a description over the limit': { packs: [{ ...pack, description: 'd'.repeat(501) }], lists: [list] },
    'a category over the limit': { packs: [{ ...pack, category: 'c'.repeat(51) }], lists: [list] },
    'a tag over the limit': { packs: [{ ...pack, tags: ['t'.repeat(51)] }], lists: [list] },
    'more tags than the limit': { packs: [{ ...pack, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }], lists: [list] },
    'a list name repeated in a pack': { packs: [pack], lists: [list, { ...list, id: 'b', name: 'A' }] },
    'a list with a group': { packs: [pack], lists: [{ ...list, group: 'g' }] },
    'a list with a category': { packs: [pack], lists: [{ ...list, category: 'c' }] },
    'a list with tags': { packs: [pack], lists: [{ ...list, tags: ['t'] }] },
    'more packs than the limit': { packs: many.map(i => ({ ...pack, id: `p${i}`, name: `P${i}` })), lists: many.map(i => ({ ...list, id: `l${i}`, name: `l${i}`, packId: `p${i}` })) },
  }
  for (const [reason, library] of Object.entries(cases)) assert.throws(() => validateLibrary(library), { message: 'Invalid packs' }, reason)
  // The same packs without the limit's excess are fine.
  const ok = many.slice(0, 150)
  validateLibrary({ packs: ok.map(i => ({ ...pack, id: `p${i}`, name: `P${i}` })), lists: ok.map(i => ({ ...list, id: `l${i}`, name: `l${i}`, packId: `p${i}` })) })
})

test('lists keep a packId and refuse one that is not a string', () => {
  const list = { id: 'a', name: 'a', packId: 'p', words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: '2026-10-01T00:00:00.000Z' }
  assert.equal(decodeLists(JSON.stringify({ version: 1, lists: [list] }))[0].packId, 'p')
  assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, packId: 1 }] })), { key: 'savedDataCorrupted' })
  assert.equal(saveList([list], { ...list, name: 'b' }, true)[0].packId, 'p')
})
