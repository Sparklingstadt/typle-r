require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
// The 初級 to 上級 parts of the country list as migration 0018 split it (tests/commands.test.cjs checks how). Since
// v0.85.0 the initial lists keep only its lowercase list.
const fs = require('node:fs')
const migration = fs.readFileSync(require.resolve('../prisma/migrations/0018_split_long_initial_lists/migration.sql'), 'utf8')
const countries = JSON.parse(migration.match(/jsonb_array_elements\('(.*)'::jsonb\)/)[1].replaceAll("''", "'"))
  .find(item => item.id === 'un-member-states-chinese-193').parts
const words = countries.flatMap(list => list.words)
const { decodeLists } = require('../src/core/wordLists.ts')
const { localDevelopmentEnabled } = require('../src/lib/localDevelopment.ts')

test('all 193 country entries match the provided source and decode in Typle', () => {
  assert.equal(decodeLists(JSON.stringify({ version: 1, lists: countries })).flatMap(list => list.words).length, 193)
  assert.equal(new Set(words.map(word => word.display)).size, 193)
  // The source typed the Chinese name, so restore that input before comparing with the source's hash. The parts no
  // longer keep the source's order, so the hash is of the entries sorted by their Chinese name.
  const source = words.map(word => ({ display: word.display, input: word.display, annotation: word.annotation }))
    .sort((a, b) => a.display < b.display ? -1 : a.display > b.display ? 1 : 0)
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    'e9d1cd0efce0db190d4d2d90af05641b04f4e86483621fa68df3de0778ed6b40')
})

test('country input is the pinyin without tone marks, apostrophes or brackets', () => {
  for (const word of words) {
    const pinyin = word.annotation.split(' / ')[0].normalize('NFD')
      .replace(/u\u0308/g, 'v').replace(/\p{M}/gu, '').replace(/['()]/g, '')
    assert.equal(word.input, pinyin, word.display)
    assert.match(word.input, /^[A-Za-z]+( [A-Za-z]+)*$/, word.display)
  }
  assert.equal(words.find(word => word.display === '阿尔巴尼亚').input, 'Aerbaniya')
  assert.equal(words.find(word => word.display === '菲律宾').input, 'Feilvbin')
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
  assert.ok(lists.some(list => list.id === 'un-member-states-chinese-193-lowercase'))
  assert.ok(lists.every(list => list.records.length === 0))
})
