require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createWorkspaceSession } = require('../src/core/workspaceSession.ts')
const { WorkspaceError } = require('../src/core/workspaceStore.ts')

const list = (id, name = id) => ({ id, name, words: [{ display: name, input: name, annotation: '' }], records: [], createdAt: '2026-10-04' })
const initial = [list('sample-1', 'Sample')]
const profiles = [{ id: 'default', name: 'メイン', listCount: 0, recordCount: 0 }, { id: 'zh', name: '中文', listCount: 0, recordCount: 0 }]
const state = (revision, lists = [], profileId = 'default', accountId = 'github:1') => ({ accountId, revision, devices: [], profiles, profileId, lists })

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** A store whose reads and writes answer with what the test passes, in the order it chooses. */
function fakeStore({ staleReads = true } = {}) {
  const reads = [], writes = []
  return {
    reads, writes,
    store: {
      location: 'account', staleReads,
      read: profileId => { const d = deferred(); reads.push({ profileId, ...d }); return d.promise },
      write: request => { const d = deferred(); writes.push({ request, ...d }); return d.promise },
    },
  }
}

function session(store, profileId = 'default') {
  const shown = [], chosen = [], saving = []
  const value = createWorkspaceSession({
    store, accountId: 'github:1', profileId, initialLists: initial,
    show: view => shown.push(view), chooseProfile: id => chosen.push(id), saving: on => saving.push(on),
  })
  return { session: value, shown, chosen, saving }
}

async function loaded(fake, data) {
  const s = session(fake.store)
  const loading = s.session.load()
  fake.reads.at(-1).resolve(data)
  await loading
  return s
}

test('an empty workspace shows the initial lists, a saved one its own lists', async () => {
  const fake = fakeStore()
  const empty = await loaded(fake, state(0))
  assert.deepEqual(empty.shown.at(-1).lists, initial)
  const saved = await loaded(fake, state(3, [list('mine')]))
  assert.deepEqual(saved.shown.at(-1).lists.map(item => item.id), ['mine'])
})

test('a profile deleted elsewhere switches to the profile the store answered for', async () => {
  const fake = fakeStore()
  const s = session(fake.store, 'zh')
  const loading = s.session.load()
  assert.equal(fake.reads[0].profileId, 'zh')
  fake.reads[0].resolve(state(2, [], 'default'))
  assert.equal(await loading, null)
  assert.deepEqual(s.chosen, ['default'])
  assert.equal(s.shown.length, 0)
})

test('results that arrive after the account or profile changed are never shown', async () => {
  const fake = fakeStore()
  const s = session(fake.store)
  const loading = s.session.load()
  s.session.close()
  fake.reads[0].resolve(state(1, [list('late')]))
  await assert.rejects(loading, { key: 'accountChangedReopen' })
  assert.equal(s.shown.length, 0)

  const other = session(fake.store)
  const reading = other.session.load()
  fake.reads[1].resolve(state(1, [], 'default', 'github:2'))
  await assert.rejects(reading, { key: 'accountChangedReopen' })
})

test('a slow cloud read does not replace a newer save, but browser data that went back is shown', async () => {
  const cloud = fakeStore()
  const c = await loaded(cloud, state(5, [list('new')]))
  const stale = c.session.load()
  cloud.reads[1].resolve(state(4, [list('old')]))
  assert.equal((await stale).revision, 5)
  assert.equal(c.shown.length, 1)

  const browser = fakeStore({ staleReads: false })
  const b = await loaded(browser, state(5, [list('new')]))
  const cleared = b.session.load()
  browser.reads[1].resolve(state(0))
  assert.equal((await cleared).revision, 0)
  assert.deepEqual(b.shown.at(-1).lists, initial)
})

test('nothing is saved before the first load, and only one save runs at a time', async () => {
  const fake = fakeStore()
  const s = session(fake.store)
  assert.equal(await s.session.update(lists => lists), false)
  assert.equal(fake.writes.length, 0)

  const ready = await loaded(fake, state(1, [list('a')]))
  const first = ready.session.update(lists => [...lists, list('b')])
  assert.equal(ready.session.busy, true)
  const second = ready.session.update(lists => lists)
  assert.equal(fake.writes.length, 1)
  assert.equal(await second, false)
  fake.writes[0].resolve(state(2, [list('a'), list('b')]))
  assert.equal(await first, true)
  assert.equal(ready.session.busy, false)
  assert.deepEqual(ready.saving, [true, false])
  assert.deepEqual(ready.shown.at(-1).lists.map(item => item.id), ['a', 'b'])
})

test('the first save keeps the initial lists unless the change starts from nothing', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(0))
  const saving = s.session.update(lists => [...lists, list('mine')])
  assert.deepEqual(fake.writes[0].request.lists.map(item => item.id), ['sample-1', 'mine'])
  assert.equal(fake.writes[0].request.revision, 0)
  assert.equal(fake.writes[0].request.accountId, 'github:1')
  fake.writes[0].resolve(state(1, fake.writes[0].request.lists))
  await saving

  const legacy = await loaded(fake, state(0))
  const importing = legacy.session.update(lists => [...lists, list('legacy')], false)
  assert.deepEqual(fake.writes[1].request.lists.map(item => item.id), ['legacy'])
  fake.writes[1].resolve(state(1, fake.writes[1].request.lists))
  await importing
})

test('a save that lost to another screen shows the latest data and reports the conflict', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(1, [list('a')]))
  const saving = s.session.update(lists => [...lists, list('b')])
  fake.writes[0].reject(new WorkspaceError('conflict', 409))
  await new Promise(setImmediate)
  fake.reads[1].resolve(state(2, [list('a'), list('elsewhere')]))
  await assert.rejects(saving, { key: 'conflict', status: 409 })
  assert.deepEqual(s.shown.at(-1).lists.map(item => item.id), ['a', 'elsewhere'])
  assert.equal(s.session.busy, false)

  const next = s.session.update(lists => lists)
  assert.equal(fake.writes[1].request.revision, 2)
  fake.writes[1].reject(new WorkspaceError('conflict', 409))
  await new Promise(setImmediate)
  fake.reads[2].reject(new WorkspaceError('databaseUnavailable', 503))
  await assert.rejects(next, { key: 'databaseUnavailable' })
})

test('a save that finishes after the account or profile changed is dropped quietly', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(1, [list('a')]))
  const saving = s.session.update(lists => lists)
  s.session.close()
  fake.writes[0].resolve(state(2, [list('a')]))
  assert.equal(await saving, false)
  assert.deepEqual(s.saving, [true])
  assert.equal(s.shown.length, 1)

  const failing = await loaded(fake, state(1, [list('a')]))
  const lost = failing.session.update(lists => lists)
  failing.session.close()
  fake.writes[1].reject(new WorkspaceError('conflict', 409))
  assert.equal(await lost, false)
  assert.equal(fake.reads.length, 2)
})

test('a save answered for another account is an error, not shown', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(1, [list('a')]))
  const saving = s.session.update(lists => lists)
  fake.writes[0].resolve(state(2, [], 'default', 'github:2'))
  await assert.rejects(saving, { key: 'accountChanged' })
  assert.equal(s.shown.length, 1)
})

test('a change that throws is reported and nothing is written', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(1, [list('a')]))
  await assert.rejects(s.session.update(() => { throw new WorkspaceError('listNameDuplicate', 400) }), { key: 'listNameDuplicate' })
  assert.equal(fake.writes.length, 0)
  assert.equal(s.session.busy, false)
})

test('profile changes keep the lists in use, and deleting that profile switches to the first one', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(1, [list('a')]))
  const renaming = s.session.updateProfiles(current => current.map(profile => ({ id: profile.id, name: profile.name + '!' })))
  assert.equal(fake.writes[0].request.profileId, 'default')
  assert.deepEqual(fake.writes[0].request.lists.map(item => item.id), ['a'])
  fake.writes[0].resolve(state(2, [list('a')]))
  await renaming

  const zhFake = fakeStore()
  const zh = session(zhFake.store, 'zh')
  const loading = zh.session.load()
  zhFake.reads[0].resolve(state(1, [list('z')], 'zh'))
  await loading
  const removing = zh.session.updateProfiles(current => current.filter(profile => profile.id !== 'zh'))
  const request = zhFake.writes[0].request
  assert.equal(request.profileId, 'default')
  assert.equal(request.lists, undefined)
  assert.deepEqual(request.profiles.map(profile => profile.id), ['default'])
  zhFake.writes[0].resolve(state(2, [], 'default'))
  assert.equal(await removing, true)
  assert.deepEqual(zh.chosen, ['default'])
})

test('devices change with the lists left as they are', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(1, [list('a')]))
  const device = { id: 'phone', name: 'Phone', kind: 'smartphone' }
  const saving = s.session.update(lists => lists, true, () => [device])
  assert.deepEqual(fake.writes[0].request.devices, [device])
  assert.deepEqual(fake.writes[0].request.lists.map(item => item.id), ['a'])
  fake.writes[0].resolve(state(2, [list('a')]))
  await saving
})
