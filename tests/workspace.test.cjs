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

test('request validation drops sharing fields sent by older screens', () => {
  const [sent] = validateWorkspaceRequest({ revision: 1, lists: [{ ...list, shared: true, shareId: 'x' }] }).lists
  assert.equal('shared' in sent, false)
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

test('stored sharing fields are dropped on read and gone from the row after the next save', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:sharing:' + require('node:crypto').randomUUID()
  try {
    await db.workspace.create({ data: { ownerId: owner, lists: [{ ...list, shared: true, shareId: 'x' }], devices: [] } })
    const repo = workspaceRepository(db)
    const read = await repo.read(owner)
    assert.equal('shared' in read.lists[0], false)
    assert.equal('shareId' in read.lists[0], false)
    await repo.write(owner, read.revision, { lists: read.lists })
    const row = await db.workspace.findUnique({ where: { ownerId: owner } })
    assert.doesNotMatch(JSON.stringify(row.lists), /shared|shareId/)
  } finally {
    await db.workspace.deleteMany({ where: { ownerId: owner } })
    await db.$disconnect()
  }
})
