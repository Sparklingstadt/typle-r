require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const countries = require('../src/plugins/packs/countries.json')
const { decodeLists } = require('../src/core/wordLists.ts')
const { localDevelopmentEnabled } = require('../src/lib/localDevelopment.ts')

test('all 193 country entries match the provided source and decode in Typle', () => {
  assert.equal(decodeLists(JSON.stringify({ version: 1, lists: [countries] }))[0].words.length, 193)
  assert.equal(new Set(countries.words.map(word => word.display)).size, 193)
  // The source typed the Chinese name, so restore that input before comparing with the source's hash.
  const source = countries.words.map(word => ({ display: word.display, input: word.display, annotation: word.annotation }))
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    'bfd033bb6992be43207729fa5569d980040ce2e84b37bf8f1f30dfc71deb357f')
})

test('country input is the pinyin without tone marks, apostrophes or brackets', () => {
  for (const word of countries.words) {
    const pinyin = word.annotation.split(' / ')[0].normalize('NFD')
      .replace(/u\u0308/g, 'v').replace(/\p{M}/gu, '').replace(/['()]/g, '')
    assert.equal(word.input, pinyin, word.display)
    assert.match(word.input, /^[A-Za-z]+( [A-Za-z]+)*$/, word.display)
  }
  assert.equal(countries.words.find(word => word.display === '阿尔巴尼亚').input, 'Aerbaniya')
  assert.equal(countries.words.find(word => word.display === '菲律宾').input, 'Feilvbin')
})

test('local login requires explicit development opt-in, secret and loopback URL', () => {
  const env = { NODE_ENV: 'development', LOCAL_DEVELOPMENT_LOGIN: '1', AUTH_SECRET: 'test-only', AUTH_URL: 'http://localhost:3000' }
  assert.equal(localDevelopmentEnabled(env), true)
  for (const patch of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { LOCAL_DEVELOPMENT_LOGIN: '0' }, { AUTH_SECRET: '' }, { AUTH_URL: 'https://example.com' }, { AUTH_URL: 'http://localhost.example.com' }, { AUTH_URL: '' }]) {
    assert.equal(localDevelopmentEnabled({ ...env, ...patch }), false)
  }
})

test('LAN login only permits an explicitly selected private IPv4 in development', () => {
  const env = { NODE_ENV: 'development', LOCAL_DEVELOPMENT_LOGIN: '1', AUTH_SECRET: 'test-only', AUTH_URL: 'http://192.168.3.49:3000', LOCAL_DEVELOPMENT_LAN_HOST: '192.168.3.49' }
  assert.equal(localDevelopmentEnabled(env), true)
  for (const patch of [{ NODE_ENV: 'production' }, { LOCAL_DEVELOPMENT_LAN_HOST: '' }, { LOCAL_DEVELOPMENT_LAN_HOST: '192.168.3.50' }, { AUTH_URL: 'http://8.8.8.8:3000', LOCAL_DEVELOPMENT_LAN_HOST: '8.8.8.8' }, { AUTH_URL: 'http://172.32.0.1:3000', LOCAL_DEVELOPMENT_LAN_HOST: '172.32.0.1' }]) {
    assert.equal(localDevelopmentEnabled({ ...env, ...patch }), false)
  }
})

test('record and list IDs work without secure-context randomUUID', () => {
  const { randomId } = require('../src/core/randomId.ts')
  const source = { getRandomValues: array => crypto.webcrypto.getRandomValues(array) }
  const ids = Array.from({ length: 100 }, () => randomId(source))
  assert.equal(new Set(ids).size, 100)
  for (const id of ids) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
})

test('the initial lists are valid saved lists with distinct ids and no records', () => {
  const { initialLists } = require('../src/plugins/packs/index.ts')
  const lists = decodeLists(JSON.stringify({ version: 1, lists: initialLists }))
  assert.equal(new Set(lists.map(list => list.id)).size, lists.length)
  assert.ok(lists.some(list => list.id === countries.id))
  assert.ok(lists.every(list => list.records.length === 0))
})
