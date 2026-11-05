require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { toSharedQuery, fromSharedQuery, sharedName, xIntentUrl, MAX_SHARED_NAME } = require('../src/core/sharedResult.ts')

const result = { name: 'Go の予約語', time: 12.345, accuracy: 98, speed: 321.6, words: 20, mode: 'normal' }

test('a result survives the trip through the link', () => {
  const query = toSharedQuery(result)
  assert.deepEqual(fromSharedQuery(new URLSearchParams(query)), { ...result, time: 12.35, speed: 322 })
})

test('the normal mode and a missing speed leave their parameters out', () => {
  const query = new URLSearchParams(toSharedQuery({ ...result, speed: null }))
  assert.equal(query.has('m'), false)
  assert.equal(query.has('s'), false)
  assert.deepEqual(fromSharedQuery(query), { ...result, time: 12.35, speed: null })
  const writing = new URLSearchParams(toSharedQuery({ ...result, mode: 'writing' }))
  assert.equal(fromSharedQuery(writing).mode, 'writing')
})

test('the query object Next.js gives a page is read too, first value of a repeated key', () => {
  assert.deepEqual(fromSharedQuery({ n: ['A', 'B'], t: '1.5', a: '100', w: '3' }), { name: 'A', time: 1.5, accuracy: 100, speed: null, words: 3, mode: 'normal' })
})

test('a link with a value missing or out of range shows nothing', () => {
  const base = { n: 'A', t: '1.5', a: '90', w: '3' }
  for (const broken of [
    { ...base, n: '   ' }, { ...base, n: undefined }, { ...base, t: '' }, { ...base, t: '-1' }, { ...base, t: '1e3' },
    { ...base, t: '99999' }, { ...base, a: '101' }, { ...base, a: '50.5' }, { ...base, w: '0' }, { ...base, w: '2.5' },
    { ...base, s: 'fast' }, { ...base, s: '9999' }, { ...base, m: 'race' },
  ]) assert.equal(fromSharedQuery(broken), null, JSON.stringify(broken))
})

test('a run shorter than the 0.01 s the link keeps is still a result', () => {
  assert.equal(fromSharedQuery(new URLSearchParams(toSharedQuery({ ...result, time: 0.004 }))).time, 0)
})

test('a speed the link would refuse is left out, and the rest still reads', () => {
  assert.equal(fromSharedQuery(new URLSearchParams(toSharedQuery({ ...result, speed: 99999 }))).speed, null)
})

test('a name is one line and at most MAX_SHARED_NAME characters', () => {
  assert.equal(sharedName('  a\n\tb  '), 'a b')
  const long = '漢'.repeat(MAX_SHARED_NAME + 10)
  assert.equal(Array.from(sharedName(long)).length, MAX_SHARED_NAME)
  assert.equal(fromSharedQuery({ n: long, t: '1', a: '1', w: '1' }).name.length, MAX_SHARED_NAME)
})

test('the X intent carries the text and the link, encoded', () => {
  const url = new URL(xIntentUrl('打ちました #Typle', 'https://typle.sparklingstadt.com/result?n=a&t=1'))
  assert.equal(url.origin + url.pathname, 'https://x.com/intent/post')
  assert.equal(url.searchParams.get('text'), '打ちました #Typle')
  assert.equal(url.searchParams.get('url'), 'https://typle.sparklingstadt.com/result?n=a&t=1')
})
