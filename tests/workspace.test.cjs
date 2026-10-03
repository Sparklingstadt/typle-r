require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadEnvConfig } = require('@next/env')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
loadEnvConfig(process.cwd())
const { workspaceRepository } = require('../src/lib/workspaceRepository.ts')
const { validateWorkspaceRequest } = require('../src/lib/workspaceRequest.ts')
const { prepareLegacy, mergeLegacy } = require('../src/lib/importLegacy.ts')
const list = { id: 'one', name: 'One', createdAt: '2026-09-06', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }

test('Prisma repository isolates owners and atomically rejects stale revisions', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:prisma:' + require('node:crypto').randomUUID()
  const other = owner + ':other'
  try {
    const repo = workspaceRepository(db)
    assert.deepEqual(await repo.read(owner), { lists: [], devices: [], revision: 0 })
    assert.equal((await repo.write(owner, [list], 0)).revision, 1)
    assert.equal(await repo.write(owner, [], 0), null)
    assert.deepEqual(await repo.read(other), { lists: [], devices: [], revision: 0 })
    assert.equal(await repo.write(other, [], 1), null)
    const results = await Promise.all([repo.write(owner, [list], 1), repo.write(owner, [], 1)])
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal((await repo.read(owner)).revision, 2)
    assert.equal((await repo.write(owner, [], 2)).revision, 3)
    assert.deepEqual(await repo.read(owner), { lists: [], devices: [], revision: 3 })
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

test('request validation rejects invalid revisions and oversized fields', () => {
  for (const revision of [-1, 1.5, '0', NaN]) assert.throws(() => validateWorkspaceRequest({ revision, lists: [] }))
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...list, name: 'a'.repeat(201) }] }))
  assert.deepEqual(validateWorkspaceRequest({ revision: 0, lists: [list] }), { revision: 0, lists: [list] })
})


test('devices sync per owner, survive older clients, and share revision conflicts', async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:devices:' + require('node:crypto').randomUUID()
  const device = { id: 'mac', name: 'MacBook', layout: 'JIS' }
  try {
    const repo = workspaceRepository(db)
    const first = await repo.write(owner, [list], 0, [device])
    assert.deepEqual(first.devices, [device])
    assert.deepEqual((await repo.read(owner + ':other')).devices, [])
    assert.equal(await repo.write(owner, [list], 0, []), null)
    assert.equal(await repo.write(owner, [list], 9, []), null)
    assert.deepEqual((await repo.write(owner, [list], 1)).devices, [device])
    const withRecord = { ...list, records: [{ id: 'r', time: 1, date: '2026-09-27', device }] }
    await repo.write(owner, [withRecord], 2, [])
    const stored = await repo.read(owner)
    assert.deepEqual(stored.devices, [])
    assert.deepEqual(stored.lists[0].records[0].device, device)
  } finally {
    await db.workspace.deleteMany({ where: { ownerId: owner } })
    await db.$disconnect()
  }
})
