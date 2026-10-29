require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { bestRecords, recentRecords, removeRecord } = require('../src/core/records.ts')
const { readWorkspace, writeWorkspace } = require('../src/plugins/storage/cloud/client.ts')
const { WorkspaceError } = require('../src/core/workspaceStore.ts')

test('record ordering and deletion preserve other lists and legacy records', () => {
  const legacy = { date: '2026-01-01', time: 1 }
  const slow = { id: 'slow', date: '2026-01-02', time: 5, accuracy: 100 }
  const fast = { id: 'fast', date: '2026-01-03', time: 2, accuracy: 100 }
  const records = [legacy, slow, fast]
  const lists = [{ id: 'a', records }, { id: 'b', records: [legacy] }]
  assert.deepEqual(bestRecords(records), [fast, slow, legacy])
  assert.deepEqual(records, [legacy, slow, fast])
  assert.equal(recentRecords(lists)[0].record, fast)
  assert.deepEqual(removeRecord(lists, 'a', legacy)[0].records, [slow, fast])
  assert.equal(removeRecord(lists, 'a', fast)[1], lists[1])
  assert.deepEqual(removeRecord(lists, 'a', fast)[0].records, [legacy, slow])
})

test('workspace transport validates responses and preserves conflict status', async t => {
  const state = { accountId: 'github:1', revision: 1, lists: [], packs: [], devices: [] }
  const fetch = t.mock.method(global, 'fetch', async () => Response.json(state))
  // A server that does not know interests leaves them out; they read as the default and are not sent unless the change has them.
  assert.deepEqual(await readWorkspace(), { ...state, interests: [...require('../src/core/interests.ts').DEFAULT_INTERESTS] })
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/workspace')
  await writeWorkspace(state)
  const [, options] = fetch.mock.calls[1].arguments
  assert.equal(options.method, 'PUT')
  assert.deepEqual(JSON.parse(options.body), state)
  fetch.mock.mockImplementation(async () => Response.json({ ...state, interests: ['language'] }))
  assert.deepEqual((await readWorkspace()).interests, ['language'])
  await writeWorkspace({ accountId: 'github:1', revision: 1, interests: ['language'] })
  assert.deepEqual(JSON.parse(fetch.mock.calls.at(-1).arguments[1].body), { accountId: 'github:1', revision: 1, interests: ['language'] })
  fetch.mock.mockImplementation(async () => Response.json({ ...state, interests: 'language' }))
  await assert.rejects(readWorkspace(), { key: 'savedDataCorrupted' })
  fetch.mock.mockImplementation(async () => Response.json(state))
  // A server from before profiles were removed also sends its profiles; only the first profile's lists are used.
  fetch.mock.mockImplementation(async () => Response.json({ ...state, profiles: [{ id: 'default', name: 'メイン', listCount: 0, recordCount: 0 }], profileId: 'default' }))
  assert.deepEqual(await readWorkspace(), { ...state, interests: [...require('../src/core/interests.ts').DEFAULT_INTERESTS] })
  fetch.mock.mockImplementation(async () => Response.json({ error: 'conflict' }, { status: 409 }))
  await assert.rejects(writeWorkspace(state), error => error instanceof WorkspaceError && error.status === 409)
  for (const invalid of [{ revision: -1 }, { lists: [{}] }, { accountId: 1 }]) {
    fetch.mock.mockImplementation(async () => Response.json({ ...state, ...invalid }))
    await assert.rejects(readWorkspace())
  }
})

test('cloud reads give lists without packs a pack of their own and keep the packs of a workspace with them', async t => {
  const list = { id: 'l', name: 'L', createdAt: '2026-09-27', words: [{ display: 'a', input: 'a', annotation: '' }], records: [], group: 'G' }
  const body = { accountId: 'github:1', revision: 1, devices: [], lists: [list] }
  const fetch = t.mock.method(global, 'fetch', async () => Response.json(body))
  // packs are null for an account that has saved nothing; groups are no longer made into packs.
  for (const packs of [{}, { packs: null }]) {
    fetch.mock.mockImplementation(async () => Response.json({ ...body, ...packs }))
    const read = await readWorkspace()
    assert.deepEqual(read.packs.map(pack => [pack.id, pack.name]), [['pack-l', 'L']])
    assert.deepEqual([read.lists[0].packId, 'group' in read.lists[0]], ['pack-l', false])
  }
  const pack = { id: 'p', name: 'P', createdAt: '2026-09-27' }
  fetch.mock.mockImplementation(async () => Response.json({ ...body, lists: [{ ...list, group: undefined, packId: 'p' }], packs: [pack] }))
  assert.deepEqual((await readWorkspace()).packs, [pack])
  fetch.mock.mockImplementation(async () => Response.json({ ...body, packs: {} }))
  await assert.rejects(readWorkspace(), { key: 'savedDataCorrupted' })
})

test('cloud reads drop sharing fields saved by older versions', async t => {
  const list = { id: 'l', name: 'L', createdAt: '2026-09-27', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }
  t.mock.method(global, 'fetch', async () => Response.json({ accountId: 'github:1', revision: 1, devices: [], lists: [{ ...list, shared: true, shareId: 'x' }] }))
  const [read] = (await readWorkspace()).lists
  assert.equal('shared' in read, false)
  assert.equal('shareId' in read, false)
})

test('cloud reads give followed packs their words from the catalog, and saves send them without', async t => {
  const { officialPacks, followOfficialPack } = require('../src/plugins/packs/catalog.ts')
  const { withoutFollowedWords } = require('../src/core/followedPacks.ts')
  const entry = officialPacks()[0]
  const library = followOfficialPack({ packs: [], lists: [] }, entry.catalogId, { pack: 'f', lists: entry.lists.map((_, i) => `f-${i}`) })
  const sent = []
  t.mock.method(global, 'fetch', async (_url, init) => {
    if (init?.body) sent.push(JSON.parse(init.body))
    return Response.json({ accountId: 'github:1', revision: 2, devices: [], ...withoutFollowedWords(library) })
  })
  const read = await readWorkspace()
  assert.deepEqual(read.lists.map(list => list.words.length), entry.lists.map(list => list.words.length))
  await writeWorkspace({ accountId: 'github:1', revision: 2, ...read })
  assert.ok(sent[0].lists.every(list => list.words.length === 0))
})
