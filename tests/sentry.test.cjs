require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { sanitizeSentryEvent } = require('../src/lib/sentry.ts')

test('error reporting removes workspace payloads, identity and request secrets', () => {
  const event = sanitizeSentryEvent({
    exception: { values: [{ type: 'Error', value: 'Database unavailable' }] },
    tags: { operation: 'workspace.write' },
    user: { id: 'github:123', email: 'private@example.com' },
    extra: { lists: [{ name: 'private words' }] },
    breadcrumbs: [{ message: 'private input' }],
    request: {
      method: 'PUT', url: 'https://typle.example/api/workspace?token=secret#private',
      headers: { authorization: 'Bearer secret', cookie: 'session=secret' },
      cookies: { session: 'secret' }, data: { lists: ['private words'] }, query_string: 'token=secret',
    },
  })
  assert.deepEqual(event.request, { method: 'PUT', url: 'https://typle.example/api/workspace' })
  assert.equal(event.user, undefined)
  assert.equal(event.extra, undefined)
  assert.equal(event.breadcrumbs, undefined)
  assert.equal(event.tags.operation, 'workspace.write')
  assert.equal(event.exception.values[0].value, 'Database unavailable')
})

test('browser exceptions without request metadata remain reportable', () => {
  const event = { exception: { values: [{ type: 'Error', value: 'Render failed' }] } }
  assert.deepEqual(sanitizeSentryEvent(event), event)
})

test('a shared link’s id stays out of error reports', () => {
  const event = sanitizeSentryEvent({
    transaction: '/shared/0b6f5c9e-3d1a-4c55-9a43-1f2e8d7c6b5a',
    request: { method: 'GET', url: 'https://typle.example/shared/0b6f5c9e-3d1a-4c55-9a43-1f2e8d7c6b5a?from=chat#top' },
  })
  assert.deepEqual(event.request, { method: 'GET', url: 'https://typle.example/shared/[id]' })
  assert.equal(event.transaction, '/shared/[id]')
})
