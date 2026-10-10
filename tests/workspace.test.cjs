require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadEnvConfig } = require('@next/env')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
loadEnvConfig(process.cwd())
const { workspaceRepository } = require('../src/plugins/storage/cloud/repository.ts')
const { validateWorkspaceRequest } = require('../src/core/workspaceRequest.ts')
const { MissingProfileError } = require('../src/core/profiles.ts')
const { prepareLegacy, mergeLegacy } = require('../src/plugins/formats/legacy.ts')
const list = { id: 'one', name: 'One', createdAt: '2026-09-06', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }
const main = (listCount = 0, recordCount = 0) => ({ id: 'default', name: 'メイン', listCount, recordCount })
const empty = (revision = 0) => ({ lists: [], devices: [], profiles: [main()], profileId: 'default', revision })
const lists = (revision, value, devices) => ({ profileId: 'default', lists: value, ...(devices ? { devices } : {}) })

test('Prisma repository isolates owners and atomically rejects stale revisions', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:prisma:' + require('node:crypto').randomUUID()
  const other = owner + ':other'
  try {
    const repo = workspaceRepository(db)
    assert.deepEqual(await repo.read(owner), empty())
    assert.equal((await repo.write(owner, 0, lists(0, [list]))).revision, 1)
    assert.equal(await repo.write(owner, 0, lists(0, [])), null)
    assert.deepEqual(await repo.read(other), empty())
    assert.equal(await repo.write(other, 1, lists(1, [])), null)
    const results = await Promise.all([repo.write(owner, 1, lists(1, [list])), repo.write(owner, 1, lists(1, []))])
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal((await repo.read(owner)).revision, 2)
    assert.equal((await repo.write(owner, 2, lists(2, []))).revision, 3)
    assert.deepEqual(await repo.read(owner), empty(3))
  } finally {
    await db.workspace.deleteMany({ where: { ownerId: { in: [owner, other] } } })
    await db.$disconnect()
  }
})

test('migration is explicit, repeatable and preserves colliding names and records', async () => {
  const source = [{ ...list, records: [{ id: 'r', date: '2026-09-06', time: 1 }] }]
  const incoming = await prepareLegacy(source)
  const suffix = n => `（移行 ${n}）`
  const merged = mergeLegacy([list], incoming, suffix)
  assert.equal(merged.length, 2)
  assert.equal(merged[1].name, 'One（移行 2）')
  assert.equal(merged[1].records.length, 1)
  assert.deepEqual(mergeLegacy(merged, await prepareLegacy(source), suffix), merged)
  assert.equal(source[0].id, 'one')
})

test('request validation keeps sharing but drops share ids sent by the client', () => {
  const [sent] = validateWorkspaceRequest({ revision: 1, lists: [{ ...list, shared: true, shareId: 'x' }] }).lists
  assert.equal(sent.shared, true)
  assert.equal('shareId' in sent, false)
})

test('request validation rejects invalid revisions and oversized fields', () => {
  for (const revision of [-1, 1.5, '0', NaN]) assert.throws(() => validateWorkspaceRequest({ revision, lists: [] }))
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...list, name: 'a'.repeat(201) }] }))
  // Clients from before profiles send no profileId and change the first profile.
  assert.deepEqual(validateWorkspaceRequest({ revision: 0, lists: [list] }), { revision: 0, profileId: 'default', lists: [list] })
  for (const profileId of ['../x', 'a b', 1, 'x'.repeat(101)]) assert.throws(() => validateWorkspaceRequest({ revision: 0, profileId, lists: [] }))
  const profiles = [{ id: 'default', name: 'メイン' }, { id: 'zh', name: '中国語' }]
  assert.throws(() => validateWorkspaceRequest({ revision: 1, profileId: 'ko', profiles }))
  assert.throws(() => validateWorkspaceRequest({ revision: 1, profileId: 'zh', profiles: [...profiles].reverse() }))
  assert.throws(() => validateWorkspaceRequest({ revision: 1, profileId: 'zh', profiles: [...profiles, { id: 'x', name: ' 中国語 ' }] }))
  assert.deepEqual(validateWorkspaceRequest({ revision: 1, profileId: 'zh', profiles }), { revision: 1, profileId: 'zh', profiles })
})


test('devices sync per owner, survive older clients, and share revision conflicts', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:devices:' + require('node:crypto').randomUUID()
  const device = { id: 'mac', name: 'MacBook', layout: 'JIS' }
  try {
    const repo = workspaceRepository(db)
    const first = await repo.write(owner, 0, lists(0, [list], [device]))
    assert.deepEqual(first.devices, [device])
    assert.deepEqual((await repo.read(owner + ':other')).devices, [])
    assert.equal(await repo.write(owner, 0, lists(0, [list], [])), null)
    assert.equal(await repo.write(owner, 9, lists(9, [list], [])), null)
    assert.deepEqual((await repo.write(owner, 1, lists(1, [list]))).devices, [device])
    const withRecord = { ...list, records: [{ id: 'r', time: 1, date: '2026-09-27', device }] }
    await repo.write(owner, 2, lists(2, [withRecord], []))
    const stored = await repo.read(owner)
    assert.deepEqual(stored.devices, [])
    assert.deepEqual(stored.lists[0].records[0].device, device)
  } finally {
    await db.workspace.deleteMany({ where: { ownerId: owner } })
    await db.$disconnect()
  }
})

test('profiles keep their own lists, share devices and the revision, and leave older clients the first profile', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:profiles:' + require('node:crypto').randomUUID()
  const device = { id: 'mac', name: 'MacBook', layout: 'JIS' }
  const chinese = { ...list, id: 'zh-list', name: '中国語', records: [{ id: 'r', time: 2, date: '2026-10-01', device }] }
  const profiles = [{ id: 'default', name: 'メイン' }, { id: 'zh', name: '中国語' }]
  try {
    const repo = workspaceRepository(db)
    await repo.write(owner, 0, { profileId: 'default', lists: [list], devices: [device] })
    // Adding a profile keeps the first profile's lists; the new one starts empty.
    const added = await repo.write(owner, 1, { profileId: 'default', profiles })
    assert.deepEqual(added.lists, [list])
    assert.deepEqual(added.profiles, [main(1, 0), { id: 'zh', name: '中国語', listCount: 0, recordCount: 0 }])
    const saved = await repo.write(owner, 2, { profileId: 'zh', lists: [chinese] })
    assert.deepEqual([saved.profileId, saved.lists, saved.devices], ['zh', [chinese], [device]])
    assert.deepEqual((await repo.read(owner)).lists, [list])
    assert.deepEqual((await repo.read(owner, 'zh')).profiles[1], { id: 'zh', name: '中国語', listCount: 1, recordCount: 1 })
    // An unknown profile reads as the first one.
    assert.equal((await repo.read(owner, 'gone')).profileId, 'default')
    // A client from before profiles writes only the first profile's lists and devices.
    const old = await db.workspace.update({ where: { ownerId: owner, revision: 3 }, data: { lists: [], devices: [], revision: { increment: 1 } } })
    assert.equal(old.revision, 4)
    assert.deepEqual((await repo.read(owner, 'zh')).lists, [chinese])
    // Writes in another profile share the revision, so stale ones are rejected.
    assert.equal(await repo.write(owner, 3, { profileId: 'zh', lists: [] }), null)
    // Deleting a profile removes its lists and records.
    const removed = await repo.write(owner, 4, { profileId: 'default', profiles: [{ id: 'default', name: '通常' }] })
    assert.deepEqual(removed.profiles, [{ id: 'default', name: '通常', listCount: 0, recordCount: 0 }])
    await assert.rejects(repo.write(owner, 5, { profileId: 'zh', lists: [] }), MissingProfileError)
    const readded = await repo.write(owner, 5, { profileId: 'default', profiles })
    assert.deepEqual((await repo.read(owner, 'zh')).lists, [])
    assert.equal(readded.revision, 6)
  } finally {
    await db.workspace.deleteMany({ where: { ownerId: owner } })
    await db.$disconnect()
  }
})

test('shared lists follow the workspace and keep their link while shared', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:share:' + require('node:crypto').randomUUID()
  const other = owner + ':other'
  const isUuid = value => /^[0-9a-f-]{36}$/.test(value)
  const profiles = [{ id: 'default', name: 'メイン' }, { id: 'p2', name: 'Two' }]
  try {
    const repo = workspaceRepository(db)
    // Turning sharing on before the first save issues a link with that save.
    let state = await repo.write(owner, 0, lists(0, [{ ...list, shared: true }]))
    const shareId = state.lists[0].shareId
    assert.ok(isUuid(shareId))
    assert.equal((await repo.read(owner)).lists[0].shareId, shareId)
    const first = await repo.readShared(shareId)
    assert.deepEqual({ name: first.name, words: first.words }, { name: 'One', words: list.words })
    assert.ok(Number.isFinite(Date.parse(first.updatedAt)))
    // Editing keeps the link and updates what it shows.
    state = await repo.write(owner, 1, lists(1, [{ ...list, name: 'Two', shared: true }]))
    assert.equal(state.lists[0].shareId, shareId)
    assert.equal((await repo.readShared(shareId)).name, 'Two')
    // A stale save changes neither the workspace nor the shared copy.
    assert.equal(await repo.write(owner, 1, lists(1, [{ ...list, name: 'Stale', shared: true }])), null)
    assert.equal((await repo.readShared(shareId)).name, 'Two')
    // Turning sharing off removes the link; turning it on again issues a new one.
    state = await repo.write(owner, 2, lists(2, [list]))
    assert.equal('shareId' in state.lists[0], false)
    assert.equal(await repo.readShared(shareId), null)
    state = await repo.write(owner, 3, lists(3, [{ ...list, shared: true }]))
    const again = state.lists[0].shareId
    assert.ok(isUuid(again) && again !== shareId)
    // Deleting the list removes its link.
    await repo.write(owner, 4, lists(4, []))
    assert.equal(await repo.readShared(again), null)
    // A share id sent by a client is never taken over: another owner's link keeps its content.
    const theirs = (await repo.write(other, 0, lists(0, [{ ...list, name: 'Theirs', shared: true }]))).lists[0].shareId
    state = await repo.write(owner, 5, lists(5, [{ ...list, shared: true, shareId: theirs }]))
    assert.notEqual(state.lists[0].shareId, theirs)
    assert.equal((await repo.readShared(theirs)).name, 'Theirs')
    // Lists of another profile are shared per profile, and deleting the profile removes their links.
    state = await repo.write(owner, 6, { profileId: 'p2', profiles, lists: [{ ...list, id: 'p2-list', shared: true }] })
    const p2 = state.lists[0].shareId
    assert.ok(isUuid(p2))
    assert.equal((await repo.read(owner, 'p2')).lists[0].shareId, p2)
    assert.ok((await repo.read(owner)).lists[0].shareId, 'the first profile keeps its own link')
    await repo.write(owner, 7, { profileId: 'default', profiles: [profiles[0]] })
    assert.equal(await repo.readShared(p2), null)
  } finally {
    await db.sharedList.deleteMany({ where: { ownerId: { in: [owner, other] } } })
    await db.workspace.deleteMany({ where: { ownerId: { in: [owner, other] } } })
    await db.$disconnect()
  }
})

test('saves that do not change a shared list leave its link untouched', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:share-quiet:' + require('node:crypto').randomUUID()
  const profiles = [{ id: 'default', name: 'メイン' }, { id: 'p2', name: 'Two' }]
  const updatedAt = async shareId => (await db.sharedList.findUnique({ where: { shareId } })).updatedAt.getTime()
  try {
    const repo = workspaceRepository(db)
    const shared = { ...list, shared: true }
    const shareId = (await repo.write(owner, 0, { profileId: 'default', profiles, lists: [shared] })).lists[0].shareId
    const before = await updatedAt(shareId)
    await new Promise(resolve => setTimeout(resolve, 20))
    // A practice record, a device change and a save in another profile are not visible through the link.
    await repo.write(owner, 1, lists(1, [{ ...shared, records: [{ id: 'r', date: '2026-10-10', time: 1 }] }]))
    await repo.write(owner, 2, lists(2, [{ ...shared, records: [{ id: 'r', date: '2026-10-10', time: 1 }] }], [{ id: 'd', name: 'PC', layout: 'jis' }]))
    await repo.write(owner, 3, { profileId: 'p2', lists: [{ ...list, id: 'other' }] })
    assert.equal(await updatedAt(shareId), before)
    // Changing its words does show.
    await repo.write(owner, 4, lists(4, [{ ...shared, words: [{ display: 'b', input: 'b', annotation: '' }] }]))
    assert.ok(await updatedAt(shareId) > before)
    assert.deepEqual((await repo.readShared(shareId)).words, [{ display: 'b', input: 'b', annotation: '' }])
  } finally {
    await db.sharedList.deleteMany({ where: { ownerId: owner } })
    await db.workspace.deleteMany({ where: { ownerId: owner } })
    await db.$disconnect()
  }
})

