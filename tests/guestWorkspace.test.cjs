require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readGuestWorkspace, writeGuestWorkspace, GUEST_STORAGE_KEY } = require('../src/lib/guestWorkspace.ts')
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const list = { id: 'l', name: 'Local', createdAt: '2026-09-27', words: [{ display: 'a', input: 'a', annotation: '' }], records: [{ time: 1, date: '2026-09-27' }] }
test('guest workspace retains lists, records, devices and deliberately empty lists', () => {
  const store = storage()
  const initial = readGuestWorkspace(store)
  const saved = writeGuestWorkspace({ ...initial, lists: [list], devices: [{ id: 'd', name: 'Mac', layout: 'JIS' }] }, store)
  assert.deepEqual(readGuestWorkspace(store), saved)
  assert.equal(saved.revision, 1)
  writeGuestWorkspace({ ...saved, lists: [] }, store)
  assert.deepEqual(readGuestWorkspace(store).lists, [])
  assert.equal(readGuestWorkspace(store).revision, 2)
})
test('stale revisions and account changes cannot overwrite guest data', () => {
  const store = storage(); const initial = readGuestWorkspace(store)
  writeGuestWorkspace({ ...initial, lists: [list] }, store)
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
  const store = storage(); const saved = writeGuestWorkspace({ ...readGuestWorkspace(store), lists: [list] }, store)
  const before = store.getItem(GUEST_STORAGE_KEY)
  assert.throws(() => writeGuestWorkspace({ ...saved, lists: [{ ...list, words: Array.from({ length: 1000 }, () => ({ display: 'あ'.repeat(1000), input: 'a', annotation: '' })) }] }, store), { key: 'guestQuotaExceeded' })
  store.setItem = () => { throw new Error('QuotaExceededError') }
  assert.throws(() => writeGuestWorkspace({ ...saved, lists: [] }, store), { key: 'guestWriteFailed' })
  assert.equal(store.getItem(GUEST_STORAGE_KEY), before)
})
