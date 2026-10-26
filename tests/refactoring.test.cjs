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
  assert.deepEqual(await readWorkspace(), state)
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/workspace')
  await writeWorkspace(state)
  const [, options] = fetch.mock.calls[1].arguments
  assert.equal(options.method, 'PUT')
  assert.deepEqual(JSON.parse(options.body), state)
  // A server from before profiles were removed also sends its profiles; only the first profile's lists are used.
  fetch.mock.mockImplementation(async () => Response.json({ ...state, profiles: [{ id: 'default', name: 'メイン', listCount: 0, recordCount: 0 }], profileId: 'default' }))
  assert.deepEqual(await readWorkspace(), state)
  fetch.mock.mockImplementation(async () => Response.json({ error: 'conflict' }, { status: 409 }))
  await assert.rejects(writeWorkspace(state), error => error instanceof WorkspaceError && error.status === 409)
  for (const invalid of [{ revision: -1 }, { lists: [{}] }, { accountId: 1 }]) {
    fetch.mock.mockImplementation(async () => Response.json({ ...state, ...invalid }))
    await assert.rejects(readWorkspace())
  }
})

test('cloud reads convert an account without packs and keep the packs of one with them', async t => {
  const list = { id: 'l', name: 'L', createdAt: '2026-09-27', words: [{ display: 'a', input: 'a', annotation: '' }], records: [], group: 'G' }
  const body = { accountId: 'github:1', revision: 1, devices: [], lists: [list] }
  const fetch = t.mock.method(global, 'fetch', async () => Response.json(body))
  // The server leaves out `packs`, or sends null, until the account's data is converted.
  for (const packs of [{}, { packs: null }]) {
    fetch.mock.mockImplementation(async () => Response.json({ ...body, ...packs }))
    const read = await readWorkspace()
    assert.deepEqual(read.packs.map(pack => [pack.id, pack.name]), [['pack-l', 'G']])
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
