require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validateLibrary, normalizeLibrary } = require('../src/core/wordPacks.ts')
const { deletePack } = require('../src/core/packEditing.ts')
const { officialPacks, catalogEntries, followOfficialPack } = require('../src/plugins/packs/catalog.ts')
const { MAX_LISTS } = require('../src/core/listOverview.ts')
const { initialLibrary, officialLibrary, initialLists } = require('../src/plugins/packs/index.ts')

const OFFICIAL_FIRST_TWO = ['pack-8f3cf116-1f9f-4579-a071-e600094b104d', 'pack-ef974a4b-3c7a-4eeb-9979-6721a0a1c81a']
const now = new Date('2026-10-26T00:00:00Z')
const idsFor = (entry, prefix) => ({ pack: prefix, lists: entry.lists.map((_, n) => `${prefix}-${n}`) })

test('the initial library is empty', () => {
  assert.deepEqual(initialLibrary, { packs: [], lists: [] })
})

test('the official packs are the packs of the official library, each with its lists', () => {
  const official = officialPacks()
  assert.equal(official.length, 30)
  assert.deepEqual(official.map(entry => entry.catalogId), officialLibrary.packs.map(pack => pack.id))
  assert.deepEqual(official.slice(0, 2).map(entry => entry.catalogId), OFFICIAL_FIRST_TWO)
  for (const entry of official) {
    assert.equal(entry.version, 1)
    assert.deepEqual(entry.pack, officialLibrary.packs.find(pack => pack.id === entry.catalogId))
    assert.deepEqual(entry.lists, officialLibrary.lists.filter(list => list.packId === entry.catalogId))
  }
})

test('the packs of the official library carry their catalog origin', () => {
  for (const pack of officialLibrary.packs) assert.deepEqual(pack.origin, { catalogId: pack.id, version: 1 })
  const converted = normalizeLibrary(initialLists, null)
  assert.deepEqual(officialLibrary.packs.map(({ origin: _origin, ...pack }) => pack), converted.packs)
  assert.deepEqual(officialLibrary.lists, converted.lists)
  validateLibrary(officialLibrary)
})

test('a pack counts as followed by its followed origin only', () => {
  assert.ok(catalogEntries(initialLibrary).every(entry => !entry.followed))
  const [first, second, third] = officialPacks()
  // A copy from before v0.98.0 has an origin without followed; the oldest accounts have the id only.
  const copies = { packs: officialLibrary.packs.map(({ origin: _origin, ...pack }) => pack), lists: officialLibrary.lists }
  assert.ok(catalogEntries(copies).every(entry => !entry.followed))
  assert.ok(catalogEntries(officialLibrary).every(entry => !entry.followed))
  let lib = followOfficialPack(initialLibrary, second.catalogId, idsFor(second, 'f2'), now)
  const followed = new Map(catalogEntries(lib).map(entry => [entry.catalogId, entry.followed]))
  assert.deepEqual([followed.get(first.catalogId), followed.get(second.catalogId), followed.get(third.catalogId)], [false, true, false])
  assert.deepEqual(catalogEntries(lib).map(entry => entry.catalogId), officialPacks().map(entry => entry.catalogId))
  lib = deletePack(lib, 'f2')
  assert.ok(catalogEntries(lib).every(entry => !entry.followed))
})

test('followOfficialPack adds the pack at the end as followed, without records and with the official lists', () => {
  const [entry] = officialPacks()
  const next = followOfficialPack(initialLibrary, entry.catalogId, idsFor(entry, 'back'), now)
  validateLibrary(next)
  const pack = next.packs.at(-1)
  const { id: _id, createdAt: _createdAt, origin: _origin, ...fields } = entry.pack
  assert.deepEqual(pack, { id: 'back', ...fields, origin: { catalogId: entry.catalogId, version: 1, followed: true }, createdAt: now.toISOString() })
  const lists = next.lists.filter(list => list.packId === 'back')
  assert.deepEqual(lists.map(list => list.id), idsFor(entry, 'back').lists)
  assert.deepEqual(next.lists.slice(-lists.length), lists)
  lists.forEach((list, n) => {
    const source = entry.lists[n]
    assert.deepEqual([list.name, list.levels, list.words, list.records, list.origin], [source.name, source.levels, source.words, [], { listId: source.id }])
  })
})

test('followOfficialPack numbers the name when a pack of that name is there, and refuses what it cannot add', () => {
  const [entry] = officialPacks()
  const once = followOfficialPack(initialLibrary, entry.catalogId, idsFor(entry, 'one'), now)
  const next = followOfficialPack(once, entry.catalogId, idsFor(entry, 'again'), now)
  assert.equal(next.packs.at(-1).name, `${entry.pack.name}（2）`)
  assert.throws(() => followOfficialPack(initialLibrary, 'missing', { pack: 'x', lists: [] }, now), { key: 'packDeleted' })
  const room = MAX_LISTS - once.lists.length
  const filler = { packs: [...once.packs, { id: 'f', name: 'Filler', createdAt: now.toISOString() }],
    lists: [...once.lists, ...Array.from({ length: room - entry.lists.length + 1 }, (_, n) =>
      ({ id: `f${n}`, name: `F${n}`, packId: 'f', words: [{ display: 'a', input: 'a', annotation: '' }], records: [], createdAt: now.toISOString() }))] }
  assert.throws(() => followOfficialPack(filler, entry.catalogId, idsFor(entry, 'over'), now), { key: 'listLimit', values: { max: MAX_LISTS } })
})
