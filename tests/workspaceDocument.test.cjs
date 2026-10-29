require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { applyChange, decodeDocument } = require('../src/core/workspaceDocument.ts')
const { readGuestWorkspace, writeGuestWorkspace, GUEST_STORAGE_KEY } = require('../src/plugins/storage/guest.ts')
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const list = { id: 'l', name: 'Local', createdAt: '2026-10-01', words: [{ display: 'a', input: 'a', annotation: '' }], records: [{ time: 1, date: '2026-10-01' }] }
const named = (id, name, extra = {}) => ({ ...list, id, name, ...extra })
const main = { id: 'default', name: 'メイン' }

test('a document without packs gives each list a pack of its own, and keeps the fields it knows', () => {
  for (const packs of [undefined, null]) {
    const document = decodeDocument({ lists: [named('a', 'A', { group: 'G', shared: true }), named('b', 'B', { group: 'G' })], packs, devices: [] })
    assert.deepEqual(document.packs.map(pack => [pack.id, pack.name]), [['pack-a', 'A'], ['pack-b', 'B']])
    assert.deepEqual(document.lists.map(item => item.packId), ['pack-a', 'pack-b'])
    assert.equal('shared' in document.lists[0], false)
  }
})

test('a change may keep lists above the limit or lower them, but not add more', () => {
  const many = count => Array.from({ length: count }, (_, index) => named('l' + index, 'L' + index))
  const document = { ...decodeDocument({ lists: many(155), devices: [] }) }
  assert.equal(applyChange(document, { lists: many(155) }).lists.length, 155)
  assert.equal(applyChange(document, { lists: many(151) }).lists.length, 151)
  assert.throws(() => applyChange(document, { lists: many(156) }), { key: 'listLimit', values: { max: 150 } })
  assert.throws(() => applyChange({ packs: [], lists: many(150), devices: [] }, { lists: many(151) }), { key: 'listLimit' })
  assert.equal(applyChange({ packs: [], lists: [], devices: [] }, { lists: many(150) }).lists.length, 150)
})

test('guest data saved before v1.0.0 reads as an empty workspace, which the next save replaces', () => {
  for (const old of [{ lists: [list], devices: [], profiles: [main, { id: 'zh', name: '中国語', lists: [] }] }, { lists: [list], devices: [] }]) {
    const store = storage()
    store.setItem(GUEST_STORAGE_KEY, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 2, ...old }))
    const read = readGuestWorkspace(store)
    assert.deepEqual([read.revision, read.lists, read.packs], [2, [], []])
    const saved = writeGuestWorkspace({ accountId: 'guest:local', revision: 2, lists: [named('new', 'New')] }, store)
    assert.deepEqual([saved.revision, saved.lists.map(item => item.id)], [3, ['new']])
    assert.equal('profiles' in JSON.parse(store.getItem(GUEST_STORAGE_KEY)), false)
  }
  // Saves of the app from when it had profiles are refused.
  const store = storage()
  for (const body of [{ profileId: 'default', lists: [] }, { profiles: [main] }]) {
    assert.throws(() => writeGuestWorkspace({ accountId: 'guest:local', revision: 0, ...body }, store))
  }
})

const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/packs', name), 'utf8'))

test('saved packs are repaired, and a change of lists alone puts each in a pack of its own', () => {
  const { lists, packs } = fixture('join-existing-pack.json')
  const document = decodeDocument({ lists, packs, devices: [] })
  // A list without a packId gets a pack of its own; a pack left without lists goes.
  const repaired = decodeDocument({ lists: [list], packs: [], devices: [] })
  assert.deepEqual(repaired.packs.map(pack => [pack.id, pack.name]), [['pack-l', 'Local']])
  assert.equal(repaired.lists[0].packId, 'pack-l')
  assert.throws(() => decodeDocument({ lists: [list], packs: {}, devices: [] }), { key: 'savedDataCorrupted' })
  const kept = applyChange(document, { devices: [] })
  assert.deepEqual([kept.packs, kept.lists], [document.packs, document.lists])
  assert.deepEqual(applyChange(document, { lists: document.lists, packs: document.packs }).packs, document.packs)
  const alone = applyChange(document, { lists: [named('x', 'X')] })
  assert.deepEqual([alone.packs.map(pack => pack.id), alone.lists[0].packId], [['pack-x'], 'pack-x'])
})

test('interests missing or null read as the default, and a change without them keeps the saved ones', () => {
  for (const interests of [undefined, null]) assert.deepEqual(decodeDocument({ lists: [], devices: [], interests }).interests, [...require('../src/core/interests.ts').DEFAULT_INTERESTS])
  const document = decodeDocument({ lists: [], devices: [], interests: ['language', 'language/zh'] })
  assert.deepEqual(document.interests, ['language', 'language/zh'])
  assert.deepEqual(applyChange(document, { devices: [] }).interests, ['language', 'language/zh'])
  assert.deepEqual(applyChange(document, { lists: [] }).interests, ['language', 'language/zh'])
  assert.deepEqual(applyChange(document, { interests: ['programming'] }).interests, ['programming'])
  assert.deepEqual(applyChange(document, { interests: [] }).interests, [])
  assert.throws(() => decodeDocument({ lists: [], devices: [], interests: 'language' }), { key: 'savedDataCorrupted' })
  assert.throws(() => decodeDocument({ lists: [], devices: [], interests: ['a', 'a'] }), { key: 'savedDataCorrupted' })
})

test('a request with invalid interests is refused, and without them carries none', () => {
  const { validateWorkspaceRequest } = require('../src/core/workspaceRequest.ts')
  assert.deepEqual(validateWorkspaceRequest({ revision: 1, interests: ['language'] }), { revision: 1, interests: ['language'] })
  assert.equal('interests' in validateWorkspaceRequest({ revision: 1, devices: [] }), false)
  for (const interests of ['language', [''], ['a', 'a'], [1], ['x'.repeat(51)], Array.from({ length: 51 }, (_, n) => `i${n}`)]) {
    assert.throws(() => validateWorkspaceRequest({ revision: 1, interests }))
  }
})
