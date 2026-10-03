require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { decodeStoredProfiles, profileProblem, removeProfile, saveProfile } = require('../src/lib/profiles.ts')
const { readGuestWorkspace, writeGuestWorkspace, GUEST_STORAGE_KEY } = require('../src/lib/guestWorkspace.ts')
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const list = { id: 'l', name: 'Local', createdAt: '2026-10-01', words: [{ display: 'a', input: 'a', annotation: '' }], records: [{ time: 1, date: '2026-10-01' }] }
const profiles = [{ id: 'default', name: 'メイン' }, { id: 'zh', name: '中国語' }]

test('profile names are required, unique ignoring case and limited in number', () => {
  assert.deepEqual(profileProblem(profiles, { id: 'ko', name: '  ' }, false), { field: 'name', key: 'profileNameRequired' })
  assert.deepEqual(profileProblem(profiles, { id: 'ko', name: ' メイン ' }, false), { field: 'name', key: 'profileNameDuplicate', values: { name: 'メイン' } })
  assert.equal(profileProblem(profiles, { id: 'zh', name: '中国語' }, true), null)
  assert.equal(profileProblem(profiles, { id: 'gone', name: 'x' }, true).field, 'form')
  const many = Array.from({ length: 10 }, (_, index) => ({ id: index ? `p${index}` : 'default', name: `P${index}` }))
  assert.deepEqual(profileProblem(many, { id: 'new', name: 'new' }, false), { field: 'form', key: 'profileLimit', values: { max: 10 } })
  assert.deepEqual(saveProfile(profiles, { id: 'ko', name: ' 韓国語 ' }, false).map(profile => profile.name), ['メイン', '中国語', '韓国語'])
  assert.deepEqual(saveProfile(profiles, { id: 'default', name: '通常' }, true)[0], { id: 'default', name: '通常' })
  assert.deepEqual(removeProfile(profiles, 'zh'), [profiles[0]])
  assert.throws(() => removeProfile(profiles, 'default'), { key: 'profileFirstUndeletable' })
})

test('stored profiles default to one first profile and reject broken data', () => {
  assert.deepEqual(decodeStoredProfiles([]), [{ id: 'default', name: 'メイン' }])
  assert.deepEqual(decodeStoredProfiles([...profiles.slice(0, 1), { ...profiles[1], lists: [list] }])[1].lists, [list])
  for (const value of [null, [{ id: 'zh', name: 'x' }], [profiles[0], profiles[0]], [profiles[0], { id: 'zh', name: 'x', lists: [{}] }]]) {
    assert.throws(() => decodeStoredProfiles(value))
  }
})

test('guest profiles keep separate lists in one store and older guest data is the first profile', () => {
  const store = storage()
  store.setItem(GUEST_STORAGE_KEY, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: [list], devices: [] }))
  const initial = readGuestWorkspace(store)
  assert.deepEqual(initial.profiles, [{ id: 'default', name: 'メイン', listCount: 1, recordCount: 1 }])
  const added = writeGuestWorkspace({ ...initial, profiles }, store)
  assert.deepEqual(added.lists, [list])
  const chinese = { ...list, id: 'zh-list', name: '中国語' }
  const saved = writeGuestWorkspace({ accountId: 'guest:local', revision: added.revision, profileId: 'zh', lists: [chinese] }, store)
  assert.deepEqual([saved.profileId, saved.lists], ['zh', [chinese]])
  assert.deepEqual(readGuestWorkspace(store).lists, [list])
  assert.deepEqual(readGuestWorkspace(store, 'zh').lists, [chinese])
  assert.equal(readGuestWorkspace(store, 'gone').profileId, 'default')
  // Writing to a profile deleted elsewhere is a conflict, so the screen reloads instead of losing the change silently.
  const removed = writeGuestWorkspace({ accountId: 'guest:local', revision: saved.revision, profileId: 'default', profiles: [profiles[0]] }, store)
  assert.equal(removed.profiles.length, 1)
  assert.throws(() => writeGuestWorkspace({ accountId: 'guest:local', revision: removed.revision, profileId: 'zh', lists: [] }, store), error => error.status === 409)
  assert.deepEqual(readGuestWorkspace(store).lists, [list])
})
