require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { api, ApiError, withQuery } = require('../src/core/api.ts')
const { addRecord, deleteRecord } = require('../src/plugins/storage/cloud/client.ts')
const { WorkspaceError } = require('../src/core/workspaceStore.ts')

test('api reads with GET, sends a body as JSON and resolves with the answer', async t => {
  const fetch = t.mock.method(global, 'fetch', async () => Response.json({ shares: [] }))
  assert.deepEqual(await api('/api/shares'), { shares: [] })
  let [url, init] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/shares')
  assert.equal(init.method, 'GET')
  assert.equal(init.cache, 'no-store')
  assert.equal(init.headers, undefined)
  assert.equal(init.body, undefined)
  await api('/api/shares', { method: 'PUT', body: { packId: 'p' } })
  ;[url, init] = fetch.mock.calls[1].arguments
  assert.equal(init.method, 'PUT')
  assert.equal(init.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(init.body), { packId: 'p' })
  fetch.mock.mockImplementation(async () => new Response(null, { status: 204 }))
  assert.equal(await api('/api/gallery/added?id=x', { method: 'POST', keepalive: true }), undefined)
  assert.equal(fetch.mock.calls[2].arguments[1].keepalive, true)
})

test('api rejects with the key and status the backend gives an error', async t => {
  const fetch = t.mock.method(global, 'fetch', async () => Response.json({ error: 'loginRequired' }, { status: 401 }))
  await assert.rejects(api('/api/workspace'), error => error instanceof ApiError && error.key === 'loginRequired' && error.status === 401)
  fetch.mock.mockImplementation(async () => new Response('<html>', { status: 502 }))
  await assert.rejects(api('/api/workspace'), error => error instanceof ApiError && error.key === undefined && error.status === 502)
  fetch.mock.mockImplementation(async () => Response.json({ error: 1 }, { status: 400 }))
  await assert.rejects(api('/api/workspace'), error => error instanceof ApiError && error.key === undefined && error.status === 400)
  fetch.mock.mockImplementation(async () => new Response('<html>', { status: 200 }))
  await assert.rejects(api('/api/workspace'), { key: 'invalidServerData' })
})

test('withQuery encodes every parameter', () => {
  assert.equal(withQuery('/api/gallery', { q: 'a b&c', page: 2 }), '/api/gallery?q=a+b%26c&page=2')
})

test('records are added with POST and deleted with DELETE, and resolve with the workspace', async t => {
  const workspace = { accountId: 'github:1', revision: 2, lists: [], packs: [], devices: [], interests: [] }
  const record = { id: 'run', time: 1, date: '2026-10-01T00:00:00.000Z' }
  const fetch = t.mock.method(global, 'fetch', async () => Response.json({ ...workspace, record }, { status: 201 }))
  assert.equal((await addRecord({ accountId: 'github:1', listId: 'l', record })).revision, 2)
  let [url, init] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/workspace/records')
  assert.equal(init.method, 'POST')
  assert.deepEqual(JSON.parse(init.body), { accountId: 'github:1', listId: 'l', record })

  fetch.mock.mockImplementation(async () => Response.json({ ...workspace, revision: 3 }))
  assert.equal((await deleteRecord({ accountId: 'github:1', listId: 'l', recordId: 'run' })).revision, 3)
  ;[url, init] = fetch.mock.calls[1].arguments
  assert.equal(init.method, 'DELETE')
  assert.deepEqual(JSON.parse(init.body), { accountId: 'github:1', listId: 'l', recordId: 'run' })

  // An error keeps the backend's key and status, as the workspace session tells a stale save by its 409.
  fetch.mock.mockImplementation(async () => Response.json({ error: 'recordListDeleted' }, { status: 404 }))
  await assert.rejects(addRecord({ accountId: 'github:1', listId: 'gone', record }),
    error => error instanceof WorkspaceError && error.key === 'recordListDeleted' && error.status === 404)
  fetch.mock.mockImplementation(async () => new Response('<html>', { status: 502 }))
  await assert.rejects(deleteRecord({ accountId: 'github:1', listId: 'l', recordId: 'run' }),
    error => error instanceof WorkspaceError && error.key === 'workspaceRequestFailed' && error.status === 502)
})
