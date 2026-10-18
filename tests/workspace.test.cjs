require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadEnvConfig } = require('@next/env')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
loadEnvConfig(process.cwd())
const { workspaceRepository } = require('../src/plugins/storage/cloud/repository.ts')
const { LegacyProfileRequest, validateWorkspaceRequest } = require('../src/core/workspaceRequest.ts')
const { prepareLegacy, mergeLegacy } = require('../src/plugins/formats/legacy.ts')
const list = { id: 'one', name: 'One', createdAt: '2026-09-06', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }
const empty = (revision = 0) => ({ lists: [], devices: [], revision })
const lists = (revision, value, devices) => ({ lists: value, ...(devices ? { devices } : {}) })

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
  // The app with profiles names the first profile in every save; that is the only list set now.
  assert.deepEqual(validateWorkspaceRequest({ revision: 0, profileId: 'default', lists: [list] }), { revision: 0, lists: [list] })
  for (const body of [{ profileId: 'zh', lists: [] }, { profileId: 'default', profiles: [{ id: 'default', name: 'メイン' }] }]) {
    assert.throws(() => validateWorkspaceRequest({ revision: 1, ...body }), LegacyProfileRequest)
  }
  // The number of lists is checked against the saved ones (see workspaceDocument), so merged lists above it can be saved.
  const many = Array.from({ length: 101 }, (_, index) => ({ ...list, id: 'l' + index, name: 'L' + index }))
  assert.equal(validateWorkspaceRequest({ revision: 1, lists: many }).lists.length, 101)
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

test('shared lists follow the workspace and keep their link while shared', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:share:' + require('node:crypto').randomUUID()
  const other = owner + ':other'
  const isUuid = value => /^[0-9a-f-]{36}$/.test(value)
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
  } finally {
    await db.sharedList.deleteMany({ where: { ownerId: { in: [owner, other] } } })
    await db.workspace.deleteMany({ where: { ownerId: { in: [owner, other] } } })
    await db.$disconnect()
  }
})

test('saves that do not change a shared list leave its link untouched', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:share-quiet:' + require('node:crypto').randomUUID()
  const updatedAt = async shareId => (await db.sharedList.findUnique({ where: { shareId } })).updatedAt.getTime()
  try {
    const repo = workspaceRepository(db)
    const shared = { ...list, shared: true }
    const shareId = (await repo.write(owner, 0, lists(0, [shared]))).lists[0].shareId
    const before = await updatedAt(shareId)
    await new Promise(resolve => setTimeout(resolve, 20))
    // A practice record, a device change and a change to another list are not visible through the link.
    await repo.write(owner, 1, lists(1, [{ ...shared, records: [{ id: 'r', date: '2026-10-10', time: 1 }] }]))
    await repo.write(owner, 2, lists(2, [{ ...shared, records: [{ id: 'r', date: '2026-10-10', time: 1 }] }], [{ id: 'd', name: 'PC', layout: 'jis' }]))
    await repo.write(owner, 3, lists(3, [{ ...shared, records: [{ id: 'r', date: '2026-10-10', time: 1 }] }, { ...list, id: 'other', name: 'Other' }]))
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

