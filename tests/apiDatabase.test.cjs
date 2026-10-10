require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { loadEnvConfig } = require('@next/env')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
loadEnvConfig(process.cwd())
const { workspaceRepository } = require('../src/plugins/storage/cloud/repository.ts')
const { tokenRepository, hashToken } = require('../src/plugins/storage/cloud/tokens.ts')
const { isTokenSecret } = require('../src/core/apiTokens.ts')
const { createList, updateList } = require('../src/core/apiRequests.ts')

const word = display => ({ display, input: display, annotation: '' })
const request = (overrides = {}) => ({ name: 'laptop', scope: 'write', expiresIn: 90, ...overrides })
const input = (name, words = ['a']) => ({ name, words: words.map(word) })
const now = new Date('2026-10-10T00:00:00Z')
const minutes = (base, count) => new Date(base.getTime() + count * 60 * 1000)

// Runs `body` with a random owner and removes every row it may have left.
async function withDatabase(body) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const owner = 'test:api:' + randomUUID()
  const other = owner + ':other'
  try {
    await body({ db, owner, other, tokens: tokenRepository(db), workspaces: workspaceRepository(db) })
  } finally {
    const where = { ownerId: { in: [owner, other] } }
    await db.apiToken.deleteMany({ where })
    await db.sharedList.deleteMany({ where })
    await db.workspace.deleteMany({ where })
    await db.$disconnect()
  }
}

test('tokens are stored only as hashes', () => withDatabase(async ({ db, owner, tokens }) => {
  const { token, secret } = await tokens.create(owner, request())
  assert.ok(isTokenSecret(secret))
  assert.equal(token.prefix, secret.slice(0, 10))
  const row = await db.apiToken.findUniqueOrThrow({ where: { tokenId: token.id } })
  assert.equal(JSON.stringify(row).includes(secret), false)
  assert.equal(row.tokenHash, hashToken(secret))
  assert.deepEqual(await tokens.verify(secret), { ownerId: owner, scope: 'write' })
  const listed = await tokens.list(owner)
  assert.equal(listed.length, 1)
  assert.equal('tokenHash' in listed[0], false)
  assert.equal(JSON.stringify(listed).includes(secret), false)
}))

test('expired, revoked and unknown tokens do not verify', () => withDatabase(async ({ owner, other, tokens }) => {
  const { token, secret } = await tokens.create(owner, request({ expiresIn: 30 }), new Date('2026-01-01T00:00:00Z'))
  assert.equal(await tokens.verify(secret, new Date('2026-01-31T00:00:00Z')), null)
  assert.deepEqual(await tokens.verify(secret, new Date('2026-01-30T23:59:59.999Z')), { ownerId: owner, scope: 'write' })
  assert.equal(await tokens.verify('typle_' + 'x'.repeat(43)), null)
  const fresh = await tokens.create(owner, request({ expiresIn: null }))
  assert.equal(await tokens.revoke(other, fresh.token.id), false)
  assert.equal(await tokens.revoke(owner, 'not-a-uuid'), false)
  assert.deepEqual(await tokens.verify(fresh.secret), { ownerId: owner, scope: 'write' })
  assert.equal(await tokens.revoke(owner, fresh.token.id), true)
  assert.equal(await tokens.verify(fresh.secret), null)
  assert.equal(await tokens.revoke(owner, fresh.token.id), false)
  assert.equal(token.expiresAt, '2026-01-31T00:00:00.000Z')
}))

test('tokens are limited to ten per owner', () => withDatabase(async ({ owner, other, tokens }) => {
  for (let index = 0; index < 10; index++) await tokens.create(owner, request({ name: 'token ' + index }))
  await assert.rejects(tokens.create(owner, request()), { key: 'tokenLimit', values: { max: 10 } })
  await tokens.create(other, request())
  assert.equal((await tokens.list(owner)).length, 10)
}))

test('concurrent token creation cannot exceed the limit', () => withDatabase(async ({ owner, tokens }) => {
  const results = await Promise.allSettled(Array.from({ length: 15 }, () => tokens.create(owner, request())))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 10)
  assert.equal((await tokens.list(owner)).length, 10)
}))

test('last use is recorded at most hourly', () => withDatabase(async ({ db, owner, tokens }) => {
  const { token, secret } = await tokens.create(owner, request(), now)
  const lastUsed = async () => (await db.apiToken.findUniqueOrThrow({ where: { tokenId: token.id } })).lastUsedAt
  assert.equal(await lastUsed(), null)
  await tokens.verify(secret, now)
  assert.deepEqual(await lastUsed(), now)
  await tokens.verify(secret, minutes(now, 30))
  assert.deepEqual(await lastUsed(), now)
  await tokens.verify(secret, minutes(now, 60))
  assert.deepEqual(await lastUsed(), minutes(now, 60))
  await tokens.verify(secret, minutes(now, 61 + 60))
  assert.deepEqual(await lastUsed(), minutes(now, 121))
}))

test('modify saves, strips share ids and updates the shared copy', () => withDatabase(async ({ db, owner, workspaces }) => {
  const saved = await workspaces.write(owner, 0, { profileId: 'default', lists: [{ id: 'one', name: 'One', createdAt: '2026-10-10', shared: true, words: [word('old')], records: [] }] })
  const shareId = saved.lists[0].shareId
  assert.ok(shareId)
  assert.deepEqual((await workspaces.readShared(shareId)).words, [word('old')])
  const { workspace, result } = await workspaces.modify(owner, 'default', ws => {
    const { lists, list } = updateList(ws.lists, 'one', { words: [word('new')] })
    return { lists, result: list.id }
  })
  assert.equal(result, 'one')
  assert.equal(workspace.revision, saved.revision + 1)
  assert.equal(workspace.lists[0].shareId, shareId)
  assert.deepEqual((await workspaces.readShared(shareId)).words, [word('new')])
  const row = await db.workspace.findUniqueOrThrow({ where: { ownerId: owner } })
  assert.equal(JSON.stringify(row.lists).includes('shareId'), false)
  assert.equal(row.revision, saved.revision + 1)
}))

test('modify retries after a conflicting write', () => withDatabase(async ({ owner, workspaces }) => {
  await workspaces.write(owner, 0, { profileId: 'default', lists: [] })
  // `change` is synchronous, so the other save is made as the first read returns: after it, before modify writes.
  const read = workspaces.read
  let interfered = false
  workspaces.read = async (...args) => {
    const workspace = await read(...args)
    if (!interfered) {
      interfered = true
      const lists = createList(workspace.lists, input('from another writer'), 'other-list', now).lists
      assert.ok(await workspaces.write(owner, workspace.revision, { profileId: 'default', lists }))
    }
    return workspace
  }
  let calls = 0
  const { workspace, result } = await workspaces.modify(owner, 'default', ws => {
    calls++
    return { lists: createList(ws.lists, input('from change'), 'change-list', now).lists, result: calls }
  })
  assert.equal(calls, 2)
  assert.equal(result, 2)
  assert.deepEqual(workspace.lists.map(list => list.id), ['other-list', 'change-list'])
  assert.equal(workspace.revision, 3)
  assert.deepEqual((await read(owner)).lists.map(list => list.id), ['other-list', 'change-list'])
}))

test('modify gives up with a conflict after three attempts', () => withDatabase(async ({ owner, workspaces }) => {
  await workspaces.write(owner, 0, { profileId: 'default', lists: [] })
  const read = workspaces.read
  workspaces.read = async (...args) => {
    const workspace = await read(...args)
    await workspaces.write(owner, workspace.revision, { profileId: 'default', lists: [] })
    return workspace
  }
  let calls = 0
  await assert.rejects(workspaces.modify(owner, 'default', ws => { calls++; return { lists: [], result: null } }), { key: 'conflict' })
  assert.equal(calls, 3)
}))

test('modify does not write when the lists are returned unchanged', () => withDatabase(async ({ owner, workspaces }) => {
  const saved = await workspaces.write(owner, 0, { profileId: 'default', lists: [] })
  const { workspace, result } = await workspaces.modify(owner, 'default', ws => ({ lists: ws.lists, result: 1 }))
  assert.equal(result, 1)
  assert.equal(workspace.revision, saved.revision)
  assert.equal((await workspaces.read(owner)).revision, saved.revision)
  const empty = await workspaces.modify('test:api:none:' + randomUUID(), 'default', ws => ({ lists: ws.lists, result: 2 }))
  assert.equal(empty.workspace.revision, 0)
}))

test('modify rejects an unknown profile', () => withDatabase(async ({ owner, workspaces }) => {
  await assert.rejects(workspaces.modify(owner, 'nope', ws => ({ lists: [], result: null })), { key: 'profileNotFound' })
}))

test('modify creates the workspace on first write', () => withDatabase(async ({ owner, workspaces }) => {
  const { workspace } = await workspaces.modify(owner, 'default', ws => ({ lists: createList(ws.lists, input('First'), 'first', now).lists, result: null }))
  assert.equal(workspace.revision, 1)
  assert.deepEqual(workspace.lists.map(list => list.id), ['first'])
  assert.equal((await workspaces.read(owner)).lists.length, 1)
}))
