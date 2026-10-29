require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createWorkspaceSession } = require('../src/core/workspaceSession.ts')
const { WorkspaceError } = require('../src/core/workspaceStore.ts')
const { normalizeLibrary, viewLists } = require('../src/core/wordPacks.ts')

const list = (id, name = id) => ({ id, name, words: [{ display: name, input: name, annotation: '' }], records: [], createdAt: '2026-10-04' })
const grouped = (id, name, group) => ({ ...list(id, name), group, category: 'C' })
const initialLibrary = normalizeLibrary([list('sample-1', 'Sample'), grouped('g1', 'G1', 'Group'), grouped('g2', 'G2', 'Group')], null)
const initial = viewLists(initialLibrary)
const state = (revision, lists = [], accountId = 'github:1', packs = null) => ({ accountId, revision, devices: [], ...normalizeLibrary(lists, packs) })

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
      read: () => { const d = deferred(); reads.push(d); return d.promise },
      write: request => { const d = deferred(); writes.push({ request, ...d }); return d.promise },
      addRecord: request => { const d = deferred(); writes.push({ request, ...d }); return d.promise },
      deleteRecord: request => { const d = deferred(); writes.push({ request, ...d }); return d.promise },
    },
  }
}

function session(store) {
  const shown = [], saving = []
  const value = createWorkspaceSession({
    store, accountId: 'github:1', initialLibrary,
    show: view => shown.push(view), saving: on => saving.push(on),
  })
  return { session: value, shown, saving }
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
  // Screens see the pack name as the group of a pack with two lists or more.
  assert.deepEqual(initial.map(item => item.group), [undefined, 'Group', 'Group'])
  const saved = await loaded(fake, state(3, [list('mine')]))
  assert.deepEqual(saved.shown.at(-1).lists.map(item => item.id), ['mine'])
})

test('results that arrive after the account changed are never shown', async () => {
  const fake = fakeStore()
  const s = session(fake.store)
  const loading = s.session.load()
  s.session.close()
  fake.reads[0].resolve(state(1, [list('late')]))
  await assert.rejects(loading, { key: 'accountChangedReopen' })
  assert.equal(s.shown.length, 0)

  const other = session(fake.store)
  const reading = other.session.load()
  fake.reads[1].resolve(state(1, [], 'github:2'))
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
  assert.deepEqual(fake.writes[0].request.lists.map(item => item.id), ['sample-1', 'g1', 'g2', 'mine'])
  assert.equal(fake.writes[0].request.revision, 0)
  assert.equal(fake.writes[0].request.accountId, 'github:1')
  fake.writes[0].resolve(state(1, fake.writes[0].request.lists, 'github:1', fake.writes[0].request.packs))
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

test('a save that finishes after the account changed is dropped quietly', async () => {
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
  fake.writes[0].resolve(state(2, [], 'github:2'))
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

test('a save sends the lists in the saved shape together with the packs', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(0))
  const saving = s.session.update(lists => lists)
  const { lists, packs } = fake.writes[0].request
  assert.deepEqual(lists.map(item => item.packId), ['pack-sample-1', 'pack-g1', 'pack-g1'])
  assert.equal(lists.some(item => 'group' in item || 'category' in item || 'tags' in item), false)
  assert.deepEqual(packs, initialLibrary.packs)
  fake.writes[0].resolve(state(1, lists, 'github:1', packs))
  await saving
  assert.deepEqual(s.shown.at(-1).lists, initial)
})

test('packs are shown as the initial ones until the first save, then as saved', async () => {
  const fake = fakeStore()
  const empty = await loaded(fake, state(0))
  assert.deepEqual(empty.shown.at(-1).packs, initialLibrary.packs)
  const saved = await loaded(fake, state(2, [list('mine')]))
  assert.deepEqual(saved.shown.at(-1).packs.map(pack => pack.id), ['pack-mine'])
})

test('updateLibrary saves the library in the saved shape, starting from the initial one at revision 0', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(0))
  const saving = s.session.updateLibrary(library => ({ ...library, packs: library.packs.map(pack => ({ ...pack, name: pack.name + '!' })) }))
  const { packs, lists, revision, accountId } = fake.writes[0].request
  assert.deepEqual(packs.map(pack => pack.name), initialLibrary.packs.map(pack => pack.name + '!'))
  assert.deepEqual(lists.map(item => item.id), ['sample-1', 'g1', 'g2'])
  assert.equal(revision, 0)
  assert.equal(accountId, 'github:1')
  fake.writes[0].resolve(state(1, lists, 'github:1', packs))
  assert.equal(await saving, true)
  assert.deepEqual(s.shown.at(-1).packs.map(pack => pack.name), packs.map(pack => pack.name))

  const legacy = await loaded(fake, state(0))
  const importing = legacy.session.updateLibrary(library => library, false)
  assert.deepEqual(fake.writes[1].request.lists, [])
  fake.writes[1].resolve(state(1))
  await importing
})

test('updateLibrary repairs what the change returns, and reads again after a conflict', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(1, [list('a')]))
  const saving = s.session.updateLibrary(library => ({ packs: [...library.packs, { id: 'empty', name: 'Empty', createdAt: '2026-10-04' }], lists: library.lists }))
  assert.deepEqual(fake.writes[0].request.packs.map(pack => pack.id), ['pack-a'])
  fake.writes[0].reject(new WorkspaceError('conflict', 409))
  await new Promise(setImmediate)
  fake.reads[1].resolve(state(2, [list('a'), list('elsewhere')]))
  await assert.rejects(saving, { key: 'conflict', status: 409 })
  assert.deepEqual(s.shown.at(-1).lists.map(item => item.id), ['a', 'elsewhere'])
  assert.equal(s.session.busy, false)
})

test('updateInterests writes only the interests, also before the first save', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, { ...state(0), interests: ['language'] })
  const saving = s.session.updateInterests(current => [...current, 'language/zh'])
  assert.deepEqual(fake.writes[0].request, { interests: ['language', 'language/zh'], revision: 0, accountId: 'github:1' })
  fake.writes[0].resolve({ ...state(1), interests: ['language', 'language/zh'] })
  assert.equal(await saving, true)
  assert.deepEqual(s.shown.at(-1).interests, ['language', 'language/zh'])
  const saved = await loaded(fake, { ...state(3, [list('a')]), interests: ['programming'] })
  assert.deepEqual(saved.shown.at(-1).interests, ['programming'])
})

test('addRecord sends the run with its device as practised, without a revision, and shows what was saved', async () => {
  const fake = fakeStore()
  const mac = { id: 'mac', name: 'Mac', layout: 'JIS' }
  const s = await loaded(fake, { ...state(4, [list('mine')]), devices: [mac] })
  const record = { id: 'run-1', time: 1, date: '2026-10-01T00:00:00.000Z', mistakes: 0, accuracy: 100, wordCount: 1, device: mac }
  const saving = s.session.addRecord('mine', record)
  // Only one save runs at a time, as for every other save.
  assert.equal(await s.session.update(lists => lists), false)
  const { request, resolve } = fake.writes.at(-1)
  assert.deepEqual(request, { accountId: 'github:1', listId: 'mine', record })
  assert.equal('revision' in request, false)
  const saved = [{ ...list('mine'), records: [{ ...record }] }]
  resolve({ ...state(6, saved), devices: [mac] })
  assert.equal(await saving, true)
  assert.equal(s.shown.at(-1).lists[0].records.length, 1)
})

test('deleteRecord sends the run by its id, without a revision, and shows what was saved', async () => {
  const fake = fakeStore()
  const s = await loaded(fake, state(4, [{ ...list('mine'), records: [{ id: 'r1', time: 1, date: '2026-10-01T00:00:00.000Z' }] }]))
  const deleting = s.session.deleteRecord('mine', 'r1')
  const { request, resolve } = fake.writes.at(-1)
  assert.deepEqual(request, { accountId: 'github:1', listId: 'mine', recordId: 'r1' })
  resolve(state(5, [list('mine')]))
  assert.equal(await deleting, true)
  assert.equal(s.shown.at(-1).lists[0].records.length, 0)
})
