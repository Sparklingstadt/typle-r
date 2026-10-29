require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { graphql, GraphQLError } = require('../src/core/graphql.ts')
const { addRecord, deleteRecord } = require('../src/plugins/storage/cloud/client.ts')
const { WorkspaceError } = require('../src/core/workspaceStore.ts')

test('graphql posts the query as JSON and resolves with its data', async t => {
  const fetch = t.mock.method(global, 'fetch', async () => Response.json({ data: { shares: [] } }))
  assert.deepEqual(await graphql('query Shares { shares { id } }', { a: 1 }), { shares: [] })
  const [url, init] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/graphql')
  assert.equal(init.method, 'POST')
  assert.equal(init.cache, 'no-store')
  assert.equal(init.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(init.body), { query: 'query Shares { shares { id } }', variables: { a: 1 } })
})

test('graphql rejects with the key and status the backend gives an error', async t => {
  const fetch = t.mock.method(global, 'fetch', async () => Response.json({ data: null,
    errors: [{ message: 'loginRequired', extensions: { code: 'loginRequired', status: 401 } }, { message: 'other' }] }))
  await assert.rejects(graphql('{ workspace { revision } }'), error => error instanceof GraphQLError && error.key === 'loginRequired' && error.status === 401)
  // A query the backend does not know has no key, and the status of the answer.
  fetch.mock.mockImplementation(async () => Response.json({ errors: [{ message: 'Cannot query field' }] }, { status: 422 }))
  await assert.rejects(graphql('{ nothing }'), error => error instanceof GraphQLError && error.key === undefined && error.status === 422)
  // A request refused before it is run is answered as REST answers it.
  fetch.mock.mockImplementation(async () => Response.json({ error: 'workspaceTooLarge' }, { status: 413 }))
  await assert.rejects(graphql('{ workspace { revision } }'), error => error instanceof GraphQLError && error.key === 'workspaceTooLarge' && error.status === 413)
  fetch.mock.mockImplementation(async () => new Response('<html>', { status: 502 }))
  await assert.rejects(graphql('{ workspace { revision } }'), error => error instanceof GraphQLError && error.key === undefined && error.status === 502)
  fetch.mock.mockImplementation(async () => Response.json({ data: null }))
  await assert.rejects(graphql('{ workspace { revision } }'), { key: 'invalidServerData' })
})

test('records are added and deleted through their mutations, and resolve with the workspace', async t => {
  const workspace = { accountId: 'github:1', revision: 2, lists: [], packs: [], devices: [], interests: [] }
  const fetch = t.mock.method(global, 'fetch', async () => Response.json({ data: { addRecord: { workspace } } }))
  const record = { id: 'run', time: 1, date: '2026-10-01T00:00:00.000Z' }
  assert.equal((await addRecord({ accountId: 'github:1', listId: 'l', record })).revision, 2)
  let body = JSON.parse(fetch.mock.calls[0].arguments[1].body)
  assert.match(body.query, /addRecord\(input: \$input\) \{ workspace \{/)
  assert.deepEqual(body.variables.input, { accountId: 'github:1', listId: 'l', record })

  fetch.mock.mockImplementation(async () => Response.json({ data: { deleteRecord: { ...workspace, revision: 3 } } }))
  assert.equal((await deleteRecord({ accountId: 'github:1', listId: 'l', recordId: 'run' })).revision, 3)
  body = JSON.parse(fetch.mock.calls[1].arguments[1].body)
  assert.deepEqual(body.variables.input, { accountId: 'github:1', listId: 'l', recordId: 'run' })

  // An error keeps the backend's key and status, as the workspace session tells a stale save by its 409.
  fetch.mock.mockImplementation(async () => Response.json({ data: null,
    errors: [{ message: 'recordListDeleted', extensions: { code: 'recordListDeleted', status: 404 } }] }))
  await assert.rejects(addRecord({ accountId: 'github:1', listId: 'gone', record }),
    error => error instanceof WorkspaceError && error.key === 'recordListDeleted' && error.status === 404)
  fetch.mock.mockImplementation(async () => Response.json({ errors: [{ message: 'Cannot query field' }] }, { status: 422 }))
  await assert.rejects(deleteRecord({ accountId: 'github:1', listId: 'l', recordId: 'run' }),
    error => error instanceof WorkspaceError && error.key === 'workspaceRequestFailed' && error.status === 422)
})
