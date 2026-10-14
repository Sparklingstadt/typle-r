require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  TOKEN_PREFIX, MAX_TOKENS, MAX_TOKEN_NAME, TOKEN_LIFETIMES, DEFAULT_TOKEN_LIFETIME,
  decodeTokenRequest, decodeTokenSummaries, tokenExpiry, allows, isTokenSecret, bearerSecret,
} = require('../src/core/apiTokens.ts')

const secret = 'typle_' + 'a'.repeat(43)

test('token limits are fixed', () => {
  assert.equal(TOKEN_PREFIX, 'typle_')
  assert.equal(MAX_TOKENS, 10)
  assert.equal(MAX_TOKEN_NAME, 50)
  assert.deepEqual(TOKEN_LIFETIMES, [30, 90, 365, null])
  assert.equal(DEFAULT_TOKEN_LIFETIME, 90)
})

test('a token request is trimmed and must name a known scope and lifetime', () => {
  assert.deepEqual(decodeTokenRequest({ name: ' Sync ', scope: 'write', expiresIn: 90 }), { name: 'Sync', scope: 'write', expiresIn: 90 })
  assert.deepEqual(decodeTokenRequest({ name: 'a'.repeat(50), scope: 'read', expiresIn: null }), { name: 'a'.repeat(50), scope: 'read', expiresIn: null })
  for (const value of [
    { name: '   ', scope: 'read', expiresIn: 30 },
    { name: 'a'.repeat(51), scope: 'read', expiresIn: 30 },
    { name: 'x', scope: 'admin', expiresIn: 30 },
    { name: 'x', scope: 'read', expiresIn: 7 },
    { name: 'x', scope: 'read' },
    { scope: 'read', expiresIn: 30 },
    { name: 5, scope: 'read', expiresIn: 30 },
    null, 'x', [], undefined,
  ]) assert.throws(() => decodeTokenRequest(value), { key: 'invalidTokenRequest' }, JSON.stringify(value))
})

test('expiry is the given number of days after now, or never', () => {
  const now = new Date('2026-10-10T00:00:00Z')
  assert.equal(tokenExpiry(30, now).toISOString(), '2026-11-09T00:00:00.000Z')
  assert.equal(tokenExpiry(365, now).toISOString(), '2027-10-10T00:00:00.000Z')
  assert.equal(tokenExpiry(null, now), null)
  assert.equal(now.toISOString(), '2026-10-10T00:00:00.000Z')
})

test('write scope includes read', () => {
  assert.equal(allows('write', 'read'), true)
  assert.equal(allows('write', 'write'), true)
  assert.equal(allows('read', 'read'), true)
  assert.equal(allows('read', 'write'), false)
})

test('a secret is the prefix plus 43 base64url characters', () => {
  assert.equal(isTokenSecret(secret), true)
  assert.equal(isTokenSecret('typle_' + 'Az09_-'.repeat(7) + 'A'), true)
  assert.equal(isTokenSecret('typle_' + 'a'.repeat(42)), false)
  assert.equal(isTokenSecret('typle_' + 'a'.repeat(44)), false)
  assert.equal(isTokenSecret('typle_' + 'a'.repeat(42) + '+'), false)
  assert.equal(isTokenSecret('a'.repeat(49)), false)
  assert.equal(isTokenSecret(secret + '\n'), false)
})

test('a bearer header yields the secret only when it is well formed', () => {
  assert.equal(bearerSecret('Bearer ' + secret), secret)
  assert.equal(bearerSecret('bearer  ' + secret), secret)
  assert.equal(bearerSecret('BEARER ' + secret), secret)
  for (const header of [null, '', 'Basic ' + secret, 'Bearer typle_short', 'Bearer', secret, 'Bearer ' + secret + ' x', 'Bearer ' + secret + '\n']) {
    assert.equal(bearerSecret(header), null, String(header))
  }
})

test('token summaries read from a response must be well formed', () => {
  const summary = { id: 'i', name: 'Sync', prefix: 'typle_abcd', scope: 'read', createdAt: '2026-10-10T00:00:00.000Z', expiresAt: null, lastUsedAt: null }
  const used = { ...summary, id: 'j', scope: 'write', expiresAt: '2027-01-01T00:00:00.000Z', lastUsedAt: '2026-10-11T00:00:00.000Z' }
  assert.deepEqual(decodeTokenSummaries([summary, used]), [summary, used])
  assert.deepEqual(decodeTokenSummaries([]), [])
  for (const value of [
    [{ ...summary, scope: 'x' }], [{ ...summary, id: 1 }], [{ ...summary, expiresAt: undefined }], [{ ...summary, createdAt: null }],
    [null], {}, 'x', null,
  ]) assert.throws(() => decodeTokenSummaries(value), { key: 'invalidServerData' }, JSON.stringify(value))
})
