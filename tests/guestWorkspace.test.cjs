require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeLibrary } = require('../src/core/wordPacks.ts')
const { readGuestWorkspace, writeGuestWorkspace, addGuestRecord, deleteGuestRecord, GUEST_STORAGE_KEY } = require('../src/plugins/storage/guest.ts')
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const list = { id: 'l', name: 'Local', packId: 'pack-l', createdAt: '2026-09-27', words: [{ display: 'a', input: 'a', annotation: '' }], records: [{ time: 1, date: '2026-09-27' }] }
const pack = { id: 'pack-l', name: 'Local', createdAt: '2026-09-27' }
test('guest workspace retains lists, records, devices and deliberately empty lists', () => {
  const store = storage()
  const initial = readGuestWorkspace(store)
  const saved = writeGuestWorkspace({ ...initial, lists: [list], packs: [pack], devices: [{ id: 'd', name: 'Mac', layout: 'JIS' }] }, store)
  assert.deepEqual(readGuestWorkspace(store), saved)
  assert.equal(saved.revision, 1)
  writeGuestWorkspace({ ...saved, lists: [], packs: [] }, store)
  assert.deepEqual(readGuestWorkspace(store).lists, [])
  assert.equal(readGuestWorkspace(store).revision, 2)
})
test('stale revisions and account changes cannot overwrite guest data', () => {
  const store = storage(); const initial = readGuestWorkspace(store)
  writeGuestWorkspace({ ...initial, lists: [list], packs: [pack] }, store)
  const before = store.getItem(GUEST_STORAGE_KEY)
  assert.throws(() => writeGuestWorkspace(initial, store), error => error.status === 409)
  assert.throws(() => writeGuestWorkspace({ ...initial, accountId: 'github:1' }, store))
  assert.equal(store.getItem(GUEST_STORAGE_KEY), before)
})
test('corrupt or unsupported storage is preserved', () => {
  for (const raw of ['{broken', 'null', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, accountId: 'guest:local', revision: -1, lists: [] })]) {
    const store = storage(); store.setItem(GUEST_STORAGE_KEY, raw)
    assert.throws(() => readGuestWorkspace(store))
    assert.throws(() => writeGuestWorkspace({ accountId: 'guest:local', revision: 0, lists: [], devices: [] }, store))
    assert.equal(store.getItem(GUEST_STORAGE_KEY), raw)
  }
})
test('quota and oversized writes retain the previous data', () => {
  const store = storage(); const saved = writeGuestWorkspace({ ...readGuestWorkspace(store), lists: [list], packs: [pack] }, store)
  const before = store.getItem(GUEST_STORAGE_KEY)
  assert.throws(() => writeGuestWorkspace({ ...saved, packs: [pack], lists: [{ ...list, words: Array.from({ length: 1000 }, () => ({ display: 'あ'.repeat(1000), input: 'a', annotation: '' })) }] }, store), { key: 'guestQuotaExceeded' })
  store.setItem = () => { throw new Error('QuotaExceededError') }
  assert.throws(() => writeGuestWorkspace({ ...saved, lists: [], packs: [] }, store), { key: 'guestWriteFailed' })
  assert.equal(store.getItem(GUEST_STORAGE_KEY), before)
})
test('each account uses its own store, says where it saves, and only the guest store follows other tabs', () => {
  const { workspaceStore } = require('../src/plugins/storage/index.ts')
  const { guestStore } = require('../src/plugins/storage/guest.ts')
  const { cloudStore } = require('../src/plugins/storage/cloud/client.ts')
  assert.equal(workspaceStore('guest:local'), guestStore)
  assert.equal(workspaceStore('github:1'), cloudStore)
  assert.equal(guestStore.location, 'browser')
  assert.equal(cloudStore.location, 'account')
  assert.equal(guestStore.staleReads, false)
  assert.equal(cloudStore.staleReads, true)
  assert.equal(cloudStore.subscribe, undefined)
  const previous = globalThis.window
  globalThis.window = new EventTarget()
  try {
    const changes = []
    const stop = guestStore.subscribe(() => changes.push(true))
    const fire = key => window.dispatchEvent(Object.assign(new Event('storage'), { key }))
    fire(GUEST_STORAGE_KEY); fire(null); fire('other-key')
    assert.equal(changes.length, 2)
    stop(); fire(GUEST_STORAGE_KEY)
    assert.equal(changes.length, 2)
  } finally { globalThis.window = previous }
})

test('guest data with old sharing fields loads and the next write drops them', () => {
  const store = storage()
  store.setItem(GUEST_STORAGE_KEY, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: [{ ...list, shared: true, shareId: 'x' }], packs: [pack], devices: [] }))
  const loaded = readGuestWorkspace(store)
  assert.equal('shared' in loaded.lists[0], false)
  writeGuestWorkspace({ accountId: 'guest:local', revision: 1, lists: loaded.lists, packs: loaded.packs }, store)
  const raw = store.getItem(GUEST_STORAGE_KEY)
  assert.doesNotMatch(raw, /shared|shareId/)
})

test('lists saved without packs are each put in a pack of their own, and lists that disagree with packs are refused', () => {
  const store = storage()
  const saved = writeGuestWorkspace({ ...readGuestWorkspace(store), lists: [list], packs: [{ ...pack, description: 'D' }] }, store)
  const lonely = { ...list, id: 'n', name: 'N' }
  delete lonely.packId
  const next = writeGuestWorkspace({ accountId: 'guest:local', revision: saved.revision, lists: [list, lonely] }, store)
  assert.deepEqual(next.packs.map(item => [item.id, item.description]), [['pack-l', undefined], ['pack-n', undefined]])
  const before = store.getItem(GUEST_STORAGE_KEY)
  assert.throws(() => writeGuestWorkspace({ accountId: 'guest:local', revision: next.revision, lists: [{ ...list, packId: 'missing' }], packs: next.packs }, store), { message: 'Invalid packs' })
  assert.equal(store.getItem(GUEST_STORAGE_KEY), before)
})

test('the guest starts with no packs', () => {
  const { initialLibrary } = require('../src/plugins/packs/index.ts')
  assert.deepEqual(initialLibrary, { packs: [], lists: [] })
  assert.deepEqual([readGuestWorkspace(storage()).packs, readGuestWorkspace(storage()).lists], [[], []])
})

test('reading guest data removes copies of official packs but keeps the guest\'s own packs', () => {
  const { officialPacks } = require('../src/plugins/packs/catalog.ts')
  const [entry] = officialPacks()
  const copy = { ...entry.pack, id: 'copy', origin: { catalogId: entry.catalogId, version: 1 } }
  const copyList = { ...entry.lists[0], id: 'copy-l', packId: 'copy' }
  const store = storage()
  const saved = writeGuestWorkspace({ ...readGuestWorkspace(store), packs: [pack, copy], lists: [list, copyList] }, store)
  assert.deepEqual(saved.packs.map(item => item.id), ['pack-l'])
  assert.deepEqual(readGuestWorkspace(store).packs.map(item => item.id), ['pack-l'])
  assert.deepEqual(readGuestWorkspace(store).lists.map(item => item.id), ['l'])
})

test('followed packs read back as the official words, and a read does not save them', () => {
  const { officialPacks, followOfficialPack } = require('../src/plugins/packs/catalog.ts')
  const [entry] = officialPacks()
  const store = storage()
  const initial = readGuestWorkspace(store)
  const followed = followOfficialPack(initial, entry.catalogId, { pack: 'f', lists: entry.lists.map((_, n) => `f-${n}`) })
  const edited = { ...followed, lists: followed.lists.map((item, n) => n === 0 ? { ...item, words: [{ display: 'x', input: 'x', annotation: '' }] } : item) }
  const saved = writeGuestWorkspace({ ...initial, ...edited }, store)
  assert.deepEqual(saved.lists[0].words, entry.lists[0].words)
  const stored = store.getItem(GUEST_STORAGE_KEY)
  // Saved without its words, which the catalog has.
  assert.deepEqual(JSON.parse(stored).lists[0].words, [])
  assert.deepEqual(readGuestWorkspace(store).lists[0].words, entry.lists[0].words)
  assert.equal(store.getItem(GUEST_STORAGE_KEY), stored)
})
test('guest interests are saved without touching lists, and old data reads as the default (every option)', () => {
  const store = storage()
  const initial = readGuestWorkspace(store)
  assert.deepEqual(initial.interests, require('../src/core/interests.ts').DEFAULT_INTERESTS)
  const withLists = writeGuestWorkspace({ ...initial, lists: [list], packs: [pack] }, store)
  const saved = writeGuestWorkspace({ accountId: withLists.accountId, revision: withLists.revision, interests: ['language', 'language/zh'] }, store)
  assert.deepEqual(readGuestWorkspace(store).interests, ['language', 'language/zh'])
  assert.deepEqual(readGuestWorkspace(store).lists, withLists.lists)
  const again = writeGuestWorkspace({ accountId: saved.accountId, revision: saved.revision, devices: [] }, store)
  assert.deepEqual(again.interests, ['language', 'language/zh'])
  const old = storage()
  old.setItem(GUEST_STORAGE_KEY, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 2, lists: [], devices: [] }))
  assert.deepEqual(readGuestWorkspace(old).interests, require('../src/core/interests.ts').DEFAULT_INTERESTS)
  assert.throws(() => writeGuestWorkspace({ accountId: 'guest:local', revision: 2, interests: ['a', 'a'] }, old))
})

test('a guest run is added without a revision, once, and keeps a list edit saved meanwhile', () => {
  const store = storage()
  const first = writeGuestWorkspace({ ...readGuestWorkspace(store), lists: [list], packs: [pack] }, store)
  // Another tab renames the list after this screen loaded revision 1.
  writeGuestWorkspace({ ...first, lists: [{ ...first.lists[0], name: 'Renamed' }] }, store)
  const record = { id: 'run-1', time: 2, date: '2026-10-01T00:00:00.000Z', mistakes: 0, accuracy: 100, wordCount: 1 }
  const added = addGuestRecord({ accountId: 'guest:local', listId: 'l', record }, store)
  assert.equal(added.revision, 3)
  assert.equal(added.lists[0].name, 'Renamed')
  assert.deepEqual(added.lists[0].records.at(-1), record)
  // Sent again (a retry): nothing changes.
  const again = addGuestRecord({ accountId: 'guest:local', listId: 'l', record }, store)
  assert.equal(again.revision, 3)
  assert.equal(readGuestWorkspace(store).lists[0].records.length, 2)
  assert.throws(() => addGuestRecord({ accountId: 'guest:local', listId: 'gone', record }, store), { key: 'recordListDeleted' })
  assert.throws(() => addGuestRecord({ accountId: 'github:1', listId: 'l', record }, store), { key: 'storageChanged' })
})

test('a guest run is deleted without a revision, and deleting it again changes nothing', () => {
  const store = storage()
  const first = writeGuestWorkspace({ ...readGuestWorkspace(store), lists: [list], packs: [pack] }, store)
  const record = { id: 'run-1', time: 2, date: '2026-10-01T00:00:00.000Z', mistakes: 0, accuracy: 100, wordCount: 1 }
  addGuestRecord({ accountId: 'guest:local', listId: 'l', record }, store)
  // Another tab renames the list after the run was added.
  const current = readGuestWorkspace(store)
  writeGuestWorkspace({ ...current, lists: [{ ...current.lists[0], name: 'Renamed' }] }, store)
  const deleted = deleteGuestRecord({ accountId: 'guest:local', listId: 'l', recordId: 'run-1' }, store)
  assert.equal(deleted.revision, first.revision + 3)
  assert.equal(deleted.lists[0].name, 'Renamed')
  assert.deepEqual(deleted.lists[0].records.map(item => item.id), [undefined])
  const again = deleteGuestRecord({ accountId: 'guest:local', listId: 'l', recordId: 'run-1' }, store)
  assert.equal(again.revision, deleted.revision)
  assert.throws(() => deleteGuestRecord({ accountId: 'github:1', listId: 'l', recordId: 'run-1' }, store), { key: 'storageChanged' })
})

test('the guest saves followed packs without their words, and reads them back with them', () => {
  const { officialPacks, followOfficialPack } = require('../src/plugins/packs/catalog.ts')
  const store = storage()
  const entry = officialPacks()[0]
  const library = followOfficialPack({ packs: [], lists: [] }, entry.catalogId, { pack: 'f', lists: entry.lists.map((_, i) => `f-${i}`) })
  const saved = writeGuestWorkspace({ ...readGuestWorkspace(store), ...library }, store)
  const raw = JSON.parse(store.getItem(GUEST_STORAGE_KEY))
  assert.ok(raw.lists.length > 0 && raw.lists.every(list => list.words.length === 0))
  assert.deepEqual(saved.lists.map(list => list.words.length), entry.lists.map(list => list.words.length))
  assert.deepEqual(readGuestWorkspace(store).lists, saved.lists)
})
