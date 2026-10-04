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
  const state = { accountId: 'github:1', revision: 1, lists: [], devices: [], profiles: [{ id: 'default', name: 'メイン', listCount: 0, recordCount: 0 }], profileId: 'default' }
  const fetch = t.mock.method(global, 'fetch', async () => Response.json(state))
  assert.deepEqual(await readWorkspace('zh'), state)
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/workspace?profile=zh')
  await writeWorkspace(state)
  const [, options] = fetch.mock.calls[1].arguments
  // A server from before profiles reads as the first profile.
  fetch.mock.mockImplementation(async () => Response.json({ accountId: 'github:1', revision: 1, lists: [], devices: [] }))
  assert.deepEqual(await readWorkspace('default'), state)
  assert.equal(fetch.mock.calls[2].arguments[0], '/api/workspace')
  assert.equal(options.method, 'PUT')
  assert.deepEqual(JSON.parse(options.body), state)
  fetch.mock.mockImplementation(async () => Response.json({ error: 'conflict' }, { status: 409 }))
  await assert.rejects(writeWorkspace(state), error => error instanceof WorkspaceError && error.status === 409)
  for (const invalid of [{ revision: -1 }, { lists: [{}] }, { profileId: 'zh' }, { profiles: [] }]) {
    fetch.mock.mockImplementation(async () => Response.json({ ...state, ...invalid }))
    await assert.rejects(readWorkspace('default'))
  }
})
