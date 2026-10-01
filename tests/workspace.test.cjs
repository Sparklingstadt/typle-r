require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadEnvConfig } = require('@next/env')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
loadEnvConfig(process.cwd())
const { workspaceRepository } = require('../src/lib/workspaceRepository.ts')
const { validateWorkspaceRequest } = require('../src/lib/workspaceRequest.ts')
const { MissingProfileError } = require('../src/lib/profiles.ts')
const { prepareLegacy, mergeLegacy } = require('../src/lib/importLegacy.ts')
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
  const merged = mergeLegacy([list], incoming)
  assert.equal(merged.length, 2)
  assert.equal(merged[1].name, 'One（移行 2）')
  assert.equal(merged[1].records.length, 1)
  assert.deepEqual(mergeLegacy(merged, await prepareLegacy(source)), merged)
  assert.equal(source[0].id, 'one')
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
