require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { INTEREST_OPTIONS, decodeInterests, toggleInterest, normalizeInterests, matchesInterests } = require('../src/core/interests.ts')

const corrupted = error => error.key === 'savedDataCorrupted'

test('options follow the spec table', () => {
  assert.deepEqual(INTEREST_OPTIONS.map(option => [option.id, option.category]), [['language', '語学'], ['programming', 'プログラミング']])
  assert.deepEqual(INTEREST_OPTIONS[0].children.map(child => child.id), ['language/zh', 'language/ru', 'language/ko', 'language/en', 'language/es', 'language/fr', 'language/de'])
  assert.deepEqual(INTEREST_OPTIONS[1].children.map(child => child.tag), ['Go', 'Kotlin', 'Java', 'TypeScript', 'PHP', 'Ruby', 'SQL', 'Linux', 'Vim', 'テスト'])
})

test('matchesInterests: parent only matches by category', () => {
  assert.equal(matchesInterests({ category: '語学', tags: ['中国語'] }, ['language']), true)
  assert.equal(matchesInterests({ category: 'プログラミング', tags: ['Go'] }, ['language']), false)
  assert.equal(matchesInterests({ category: ' 語学 ' }, ['language']), true)
})

test('matchesInterests: children match by tag', () => {
  const both = ['language', 'language/zh']
  assert.equal(matchesInterests({ category: '語学', tags: ['中国語'] }, both), true)
  assert.equal(matchesInterests({ category: '語学' }, both), false)
  assert.equal(matchesInterests({ category: '語学', tags: ['ロシア語'] }, both), false)
  assert.equal(matchesInterests({ category: 'プログラミング', tags: ['中国語'] }, both), false)
  assert.equal(matchesInterests({ category: 'プログラミング', tags: ['go'] }, ['programming', 'programming/go']), true)
  assert.equal(matchesInterests({ category: 'プログラミング', tags: [' GO '] }, ['programming', 'programming/go']), true)
})

test('matchesInterests: any parent may match; empty or unknown matches nothing', () => {
  const pack = { category: 'プログラミング', tags: ['Go'] }
  assert.equal(matchesInterests(pack, ['language', 'programming']), true)
  assert.equal(matchesInterests(pack, []), false)
  assert.equal(matchesInterests(pack, ['x/y']), false)
  assert.equal(matchesInterests({}, ['language']), false)
})

test('toggleInterest', () => {
  assert.deepEqual(toggleInterest([], 'language'), ['language'])
  assert.deepEqual(toggleInterest(['language'], 'language/ru'), ['language', 'language/ru'])
  assert.deepEqual(toggleInterest(['language', 'language/ru'], 'language/ru'), ['language'])
  assert.deepEqual(toggleInterest(['language'], 'language'), [])
  assert.deepEqual(toggleInterest(['language', 'language/ru', 'programming'], 'language'), ['programming'])
  assert.deepEqual(toggleInterest([], 'language/ru'), [])
  assert.deepEqual(toggleInterest(['programming'], 'language/ru'), ['programming'])
})

test('toggleInterest keeps unknown ids after known ones', () => {
  assert.deepEqual(toggleInterest(['x/y'], 'language'), ['language', 'x/y'])
  assert.deepEqual(toggleInterest(['language', 'x/y'], 'language'), ['x/y'])
  assert.deepEqual(toggleInterest(['programming', 'x/y'], 'language'), ['language', 'programming', 'x/y'])
})

test('normalizeInterests orders by options and drops duplicates', () => {
  assert.deepEqual(normalizeInterests(['programming/go', 'z', 'language/ru', 'language', 'programming', 'a', 'z', 'language']),
    ['language', 'language/ru', 'programming', 'programming/go', 'z', 'a'])
})

test('decodeInterests', () => {
  assert.deepEqual(decodeInterests(undefined), [])
  assert.deepEqual(decodeInterests(null), [])
  assert.deepEqual(decodeInterests(['language', 'x']), ['language', 'x'])
  assert.equal(decodeInterests(Array.from({ length: 50 }, (_, n) => `i${n}`)).length, 50)
  assert.deepEqual(decodeInterests(['a'.repeat(50)]), ['a'.repeat(50)])
  for (const bad of [['a', 1], Array.from({ length: 51 }, (_, n) => `i${n}`), ['a'.repeat(51)], ['a', 'a'], [''], 'language', {}, 1]) {
    assert.throws(() => decodeInterests(bad), corrupted)
  }
})
