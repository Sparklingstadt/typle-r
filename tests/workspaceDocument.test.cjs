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

test('lists of removed profiles follow the first profile’s, with clashing ids and names made unique', () => {
  const stored = {
    lists: [named('l', 'Local'), named('zh-l', 'Extra')],
    devices: [],
    profiles: [main, { id: 'zh', name: '中国語', lists: [named('l', ' local '), named('x', 'Extra'), named('y', 'New', { shared: true })] },
      { id: 'ko', name: '韓国語', lists: [named('l', 'Local')] }],
  }
  const document = decodeDocument(stored)
  assert.equal(document.legacy, true)
  assert.deepEqual(document.lists.map(item => [item.id, item.name]), [
    ['l', 'Local'], ['zh-l', 'Extra'],
    // `zh-l` is taken by the first profile too, so the next free id is used.
    ['zh-l-2', 'local（中国語）'], ['x', 'Extra（中国語）'], ['y', 'New'],
    ['ko-l', 'Local（韓国語）'],
  ])
  assert.equal('shared' in document.lists[4], false)
  assert.deepEqual(document.lists[2].records, list.records)
})

test('a name clashing again gets a number, and long names stay within the limit', () => {
  const long = 'n'.repeat(200)
  const document = decodeDocument({ lists: [named('a', 'A'), named('b', 'A（P）'), named('c', long)], devices: [],
    profiles: [main, { id: 'p', name: 'P', lists: [named('d', 'A'), named('e', long)] }] })
  assert.deepEqual(document.lists.slice(3).map(item => item.name), ['A（P 2）', 'n'.repeat(197) + '（P）'])
})

test('data without removed profiles reads as it is', () => {
  for (const profiles of [undefined, []]) {
    const document = decodeDocument({ lists: [list], devices: [], profiles })
    assert.deepEqual([document.lists, document.legacy], [[{ ...list, packId: 'pack-l' }], false])
  }
  // Only the first profile, as the app with profiles saved it after the others were deleted: saved once without it.
  assert.equal(decodeDocument({ lists: [list], devices: [], profiles: [main] }).legacy, true)
  assert.throws(() => decodeDocument({ lists: [], devices: [], profiles: [main, { id: 'zh', name: 'x', lists: [{}] }] }))
  assert.throws(() => decodeDocument({ lists: [], devices: [], profiles: {} }))
})

test('a change may keep merged lists above the limit or lower them, but not add more', () => {
  const many = count => Array.from({ length: count }, (_, index) => named('l' + index, 'L' + index))
  const document = { ...decodeDocument({ lists: many(155), devices: [] }) }
  assert.equal(applyChange(document, { lists: many(155) }).lists.length, 155)
  assert.equal(applyChange(document, { lists: many(151) }).lists.length, 151)
  assert.throws(() => applyChange(document, { lists: many(156) }), { key: 'listLimit', values: { max: 150 } })
  assert.throws(() => applyChange({ packs: [], lists: many(150), devices: [] }, { lists: many(151) }), { key: 'listLimit' })
  assert.equal(applyChange({ packs: [], lists: [], devices: [] }, { lists: many(150) }).lists.length, 150)
})

test('guest data with profiles is merged once with a new revision, and saves read before it conflict', () => {
  const store = storage()
  const chinese = named('zh-list', '中国語')
  store.setItem(GUEST_STORAGE_KEY, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 2, lists: [list], devices: [],
    profiles: [main, { id: 'zh', name: '中国語', lists: [chinese] }] }))
  const merged = readGuestWorkspace(store)
  assert.deepEqual([merged.revision, merged.lists.map(item => item.id)], [3, ['l', 'zh-list']])
  const raw = JSON.parse(store.getItem(GUEST_STORAGE_KEY))
  assert.deepEqual([raw.revision, 'profiles' in raw], [3, false])
  assert.equal(readGuestWorkspace(store).revision, 3)
  // A tab still showing revision 2 reloads instead of losing the merged list.
  assert.throws(() => writeGuestWorkspace({ accountId: 'guest:local', revision: 2, lists: [list] }, store), error => error.status === 409)
  // A tab of the app with profiles saving another profile, or changing them, reloads too.
  for (const body of [{ profileId: 'zh', lists: [] }, { profileId: 'default', profiles: [main] }]) {
    assert.throws(() => writeGuestWorkspace({ accountId: 'guest:local', revision: 3, ...body }, store), error => error.status === 409)
  }
  const saved = writeGuestWorkspace({ accountId: 'guest:local', revision: 3, profileId: 'default', lists: [chinese] }, store)
  assert.deepEqual([saved.revision, saved.lists.map(item => item.id)], [4, ['zh-list']])
  assert.deepEqual(readGuestWorkspace(store).lists, saved.lists)
})

const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/packs', name), 'utf8'))

test('a document without packs is converted, and one with packs is repaired', () => {
  const { lists, expected } = fixture('groups.json')
  for (const packs of [undefined, null]) {
    const document = decodeDocument({ lists, packs, devices: [] })
    assert.deepEqual([document.packs, document.lists], [expected.packs, expected.lists])
  }
  // Saved packs are kept; a list without a packId gets a pack of its own.
  const repaired = decodeDocument({ lists: [list], packs: [], devices: [] })
  assert.deepEqual(repaired.packs.map(pack => [pack.id, pack.name]), [['pack-l', 'Local']])
  assert.equal(repaired.lists[0].packId, 'pack-l')
  assert.throws(() => decodeDocument({ lists: [list], packs: {}, devices: [] }), { key: 'savedDataCorrupted' })
})

test('a change of lists keeps the saved packs and drops those left without lists', () => {
  const { lists, expected } = fixture('groups.json')
  const document = decodeDocument({ lists, devices: [] })
  const same = applyChange(document, { lists: expected.lists })
  assert.deepEqual(same.packs, expected.packs)
  const kept = applyChange(document, { devices: [] })
  assert.deepEqual([kept.packs, kept.lists], [expected.packs, expected.lists])
  // Removing every list of a pack removes the pack.
  const gone = new Set(expected.packs.filter(pack => pack.name === 'Linux').map(pack => pack.id))
  const rest = applyChange(document, { lists: expected.lists.filter(item => !gone.has(item.packId)) })
  assert.equal(rest.packs.some(pack => gone.has(pack.id)), false)
  assert.equal(rest.packs.length, expected.packs.length - gone.size)
})
