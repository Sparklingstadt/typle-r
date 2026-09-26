require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const countries = require('../src/json/Countries.json')
const { decodeLists } = require('../src/lib/wordLists.ts')
const { localDevelopmentEnabled } = require('../src/lib/localDevelopment.ts')

test('all 193 country entries match the provided source and decode in Typle', () => {
  assert.equal(decodeLists(JSON.stringify({ version: 1, lists: [countries] }))[0].words.length, 193)
  assert.equal(new Set(countries.words.map(word => word.display)).size, 193)
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(countries.words)).digest('hex'),
    'bfd033bb6992be43207729fa5569d980040ce2e84b37bf8f1f30dfc71deb357f')
})

test('local login requires explicit development opt-in, secret and loopback URL', () => {
  const env = { NODE_ENV: 'development', LOCAL_DEVELOPMENT_LOGIN: '1', AUTH_SECRET: 'test-only', AUTH_URL: 'http://localhost:3000' }
  assert.equal(localDevelopmentEnabled(env), true)
  for (const patch of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { LOCAL_DEVELOPMENT_LOGIN: '0' }, { AUTH_SECRET: '' }, { AUTH_URL: 'https://example.com' }, { AUTH_URL: 'http://localhost.example.com' }, { AUTH_URL: '' }]) {
    assert.equal(localDevelopmentEnabled({ ...env, ...patch }), false)
  }
})
