require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validateLibrary, normalizeLibrary } = require('../src/core/wordPacks.ts')
const { deletePack } = require('../src/core/packEditing.ts')
const { officialPacks, catalogEntries, addOfficialPack } = require('../src/plugins/packs/catalog.ts')
const { MAX_LISTS } = require('../src/core/listOverview.ts')
const { initialLibrary, initialLists } = require('../src/plugins/packs/index.ts')

const now = new Date('2026-10-26T00:00:00Z')
const idsFor = (entry, prefix) => ({ pack: prefix, lists: entry.lists.map((_, n) => `${prefix}-${n}`) })

test('the official packs are the packs of the initial library, each with its lists', () => {
  const official = officialPacks()
  assert.deepEqual(official.map(entry => entry.catalogId), initialLibrary.packs.map(pack => pack.id))
  for (const entry of official) {
    assert.equal(entry.version, 1)
    assert.deepEqual(entry.pack, initialLibrary.packs.find(pack => pack.id === entry.catalogId))
    assert.deepEqual(entry.lists, initialLibrary.lists.filter(list => list.packId === entry.catalogId))
  }
})

test('the packs of the initial library carry their catalog origin', () => {
  for (const pack of initialLibrary.packs) assert.deepEqual(pack.origin, { catalogId: pack.id, version: 1 })
  const converted = normalizeLibrary(initialLists, null)
  assert.deepEqual(initialLibrary.packs.map(({ origin: _origin, ...pack }) => pack), converted.packs)
  assert.deepEqual(initialLibrary.lists, converted.lists)
  validateLibrary(initialLibrary)
})

test('a pack counts as added by its origin, or by its id for accounts made before origins existed', () => {
  assert.ok(catalogEntries(initialLibrary).every(entry => entry.added))
  const [first, second, third] = officialPacks()
  // An account from PR 1 to 4: the same ids, no origin.
  const old = { packs: initialLibrary.packs.map(({ origin: _origin, ...pack }) => pack), lists: initialLibrary.lists }
  assert.ok(catalogEntries(old).every(entry => entry.added))
  // A deleted pack is not added; a pack added back under a new id is, by its origin.
  let lib = deletePack(deletePack(initialLibrary, first.catalogId), second.catalogId)
  lib = addOfficialPack(lib, second.catalogId, idsFor(second, 'back'), now)
  const added = new Map(catalogEntries(lib).map(entry => [entry.catalogId, entry.added]))
  assert.deepEqual([added.get(first.catalogId), added.get(second.catalogId), added.get(third.catalogId)], [false, true, true])
  assert.deepEqual(catalogEntries(lib).map(entry => entry.catalogId), officialPacks().map(entry => entry.catalogId))
})

test('addOfficialPack puts a deleted official pack back at the end, without records and with its origin', () => {
  const [entry] = officialPacks()
  const recorded = { ...initialLibrary, lists: initialLibrary.lists.map(list => list.packId === entry.catalogId ? { ...list, records: [{ time: 1, date: now.toISOString() }] } : list) }
  const next = addOfficialPack(deletePack(recorded, entry.catalogId), entry.catalogId, idsFor(entry, 'back'), now)
  validateLibrary(next)
  const pack = next.packs.at(-1)
  const { id: _id, createdAt: _createdAt, origin: _origin, ...fields } = entry.pack
  assert.deepEqual(pack, { id: 'back', ...fields, origin: { catalogId: entry.catalogId, version: 1 }, createdAt: now.toISOString() })
  const lists = next.lists.filter(list => list.packId === 'back')
  assert.deepEqual(lists.map(list => list.id), idsFor(entry, 'back').lists)
  assert.deepEqual(next.lists.slice(-lists.length), lists)
  lists.forEach((list, n) => {
    const source = entry.lists[n]
    assert.deepEqual([list.name, list.levels, list.words, list.records, list.createdAt], [source.name, source.levels, source.words, [], now.toISOString()])
  })
})

test('addOfficialPack numbers the name when a pack of that name is there, and refuses what it cannot add', () => {
  const [entry] = officialPacks()
  const next = addOfficialPack(initialLibrary, entry.catalogId, idsFor(entry, 'again'), now)
  assert.equal(next.packs.at(-1).name, `${entry.pack.name}（2）`)
  assert.throws(() => addOfficialPack(initialLibrary, 'missing', { pack: 'x', lists: [] }, now), { key: 'packDeleted' })
  const room = MAX_LISTS - initialLibrary.lists.length
  const filler = { packs: [...initialLibrary.packs, { id: 'f', name: 'Filler', createdAt: now.toISOString() }],
    lists: [...initialLibrary.lists, ...Array.from({ length: room - entry.lists.length + 1 }, (_, n) =>
      ({ id: `f${n}`, name: `F${n}`, packId: 'f', words: [{ display: 'a', input: 'a', annotation: '' }], records: [], createdAt: now.toISOString() }))] }
  assert.throws(() => addOfficialPack(filler, entry.catalogId, idsFor(entry, 'over'), now), { key: 'listLimit', values: { max: MAX_LISTS } })
})
