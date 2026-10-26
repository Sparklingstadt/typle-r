require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { followOfficial, followPack, isFollowed } = require('../src/core/followedPacks.ts')
const { normalizeLibrary, decodePacks, validateLibrary } = require('../src/core/wordPacks.ts')
const { decodeLists } = require('../src/core/wordLists.ts')

const dir = path.join(__dirname, 'fixtures/follow')
for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
  test(`fixture ${file}`, () => {
    const { official, library, expected } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const once = followOfficial(normalizeLibrary(library.lists, library.packs), official)
    assert.deepEqual(once, expected)
    // Applying it again changes nothing.
    assert.deepEqual(followOfficial(once, official), once)
    validateLibrary(once)
  })
}

const OD = '2026-01-01T00:00:00.000Z'
const word = display => ({ display, input: display, annotation: '' })
const official = [{
  catalogId: 'go', version: 1,
  pack: { id: 'go', name: 'Go', description: 'Go tools', origin: { catalogId: 'go', version: 1 }, createdAt: OD },
  lists: [
    { id: 'b', name: 'Beta', packId: 'go', words: [word('b')], records: [], createdAt: OD },
    { id: 'a', name: 'Alpha', levels: ['基本'], packId: 'go', words: [word('a')], records: [], createdAt: OD },
  ],
}]
const ids = { pack: 'new-pack', lists: ['new-b', 'new-a'] }
const now = new Date('2026-10-26T00:00:00.000Z')

test('followPack adds the official pack at the end, following it', () => {
  const result = followPack({ packs: [], lists: [] }, official, 'go', ids, now)
  assert.equal(result.packs.length, 1)
  assert.deepEqual(result.packs[0].origin, { catalogId: 'go', version: 1, followed: true })
  assert.equal(result.packs[0].id, 'new-pack')
  assert.equal(result.packs[0].name, 'Go')
  assert.equal(result.packs[0].description, 'Go tools')
  assert.equal(result.packs[0].createdAt, now.toISOString())
  assert.deepEqual(result.lists.map(list => [list.id, list.origin.listId, list.packId, list.name]),
    [['new-b', 'b', 'new-pack', 'Beta'], ['new-a', 'a', 'new-pack', 'Alpha']])
  assert.deepEqual(result.lists[1].levels, ['基本'])
  assert.ok(result.lists.every(list => list.records.length === 0 && list.createdAt === now.toISOString()))
  assert.equal(isFollowed(result.packs[0]), true)
  validateLibrary(result)
  assert.deepEqual(followOfficial(result, official), result)
})

test('followPack names the pack （2） when the name is taken', () => {
  const own = { id: 'mine', name: 'go', createdAt: OD }
  const mineList = { id: 'l', name: 'L', packId: 'mine', words: [word('x')], records: [], createdAt: OD }
  const result = followPack({ packs: [own], lists: [mineList] }, official, 'go', ids, now)
  assert.deepEqual(result.packs.map(pack => pack.name), ['go', 'Go（2）'])
  assert.equal(result.lists[0].id, 'l')
  validateLibrary(result)
})

test('followPack refuses a catalogId that is not in the catalog', () => {
  assert.throws(() => followPack({ packs: [], lists: [] }, official, 'rust', ids, now), { key: 'packDeleted' })
})

test('isFollowed is true only for a followed origin', () => {
  assert.equal(isFollowed({}), false)
  assert.equal(isFollowed({ origin: { catalogId: 'go', version: 1 } }), false)
  assert.equal(isFollowed({ origin: { catalogId: 'go', version: 1, followed: true } }), true)
})

test('decodePacks accepts followed: true only', () => {
  const pack = { id: 'p', name: 'P', createdAt: OD }
  assert.deepEqual(decodePacks([{ ...pack, origin: { catalogId: 'go', version: 1, followed: true } }])[0].origin.followed, true)
  for (const followed of [false, 'yes', 1, null]) {
    assert.throws(() => decodePacks([{ ...pack, origin: { catalogId: 'go', version: 1, followed } }]), { key: 'savedDataCorrupted' })
  }
})

test('decodeLists keeps a list origin of the right shape and drops the others', () => {
  const list = { id: 'a', name: 'a', words: [word('x')], records: [], createdAt: OD }
  const read = origin => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, ...(origin === undefined ? {} : { origin }) }] }))[0]
  assert.deepEqual(read({ listId: 'x' }).origin, { listId: 'x' })
  for (const bad of [null, 'x', {}, { listId: 1 }, [], { listId: null }]) assert.equal('origin' in read(bad), false)
  assert.equal('origin' in read(undefined), false)
})
