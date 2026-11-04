require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { matchingPacks, upcomingWords, oneLineDisplay, isParagraphWord, currentMode } = require('../src/core/practiceView.ts')
const { packOverviews } = require('../src/core/packEditing.ts')

const word = (display, input_type = 'word') => ({ display, input: display, annotation: '', input_type })
const texts = (...items) => items.map(text => ({ display: text, input: text.toLowerCase(), annotation: '' }))
const stamp = '2026-10-01T00:00:00.000Z'
const list = (id, name, packId, extra = {}) => ({ id, name, packId, words: texts('ls'), records: [], createdAt: stamp, ...extra })
const library = () => ({
  packs: [
    { id: 'p', name: 'Linux', category: 'プログラミング', tags: ['Linux'], createdAt: stamp },
    { id: 'q', name: 'Go', category: '英語', createdAt: stamp },
  ],
  lists: [
    list('a', '基本', 'p', { words: texts('ls', 'cat') }),
    list('g', '基本', 'q', { words: texts('go') }),
    list('b', '応用', 'p', { words: texts('grep') }),
  ],
})

test('matchingPacks narrows the packs by category and by query, keeping the order given', () => {
  const overviews = packOverviews(library())
  const ids = items => items.map(item => item.pack.id)
  assert.deepEqual(ids(matchingPacks(overviews, null, '')), ['p', 'q'])
  assert.deepEqual(ids(matchingPacks(overviews, 'プログラミング', '')), ['p'])
  assert.deepEqual(ids(matchingPacks(overviews, null, 'grep')), ['p'])
  assert.deepEqual(ids(matchingPacks(overviews, '英語', 'grep')), [])
  assert.deepEqual(ids(matchingPacks(overviews, 'プログラミング', 'go')), [])
})

test('upcomingWords returns up to three words and the rest', () => {
  const words = ['a', 'b', 'c', 'd', 'e', 'f'].map(text => word(text))
  assert.deepEqual(upcomingWords(words, 0).next.map(item => item.display), ['b', 'c', 'd'])
  assert.equal(upcomingWords(words, 0).remaining, 2)
  assert.deepEqual(upcomingWords(words, 5), { next: [], remaining: 0 })
})

test('oneLineDisplay joins code lines with two spaces and leaves other words alone', () => {
  assert.equal(oneLineDisplay(word('a\r\nb\nc', 'code')), 'a  b  c')
  assert.equal(oneLineDisplay(word('a\nb')), 'a\nb')
})

test('isParagraphWord is true over 24 characters or with a line break, never for code', () => {
  assert.equal(isParagraphWord(word('あ'.repeat(24))), false)
  assert.equal(isParagraphWord(word('あ'.repeat(25))), true)
  assert.equal(isParagraphWord(word('😀'.repeat(24))), false)
  assert.equal(isParagraphWord(word('a\nb')), true)
  assert.equal(isParagraphWord(word('a'.repeat(30), 'code')), false)
})

test('currentMode: writing wins, a started run keeps its mode, otherwise the choice applies', () => {
  assert.equal(currentMode('writing', true, 'recall', 'normal'), 'writing')
  assert.equal(currentMode('normal', true, 'recall', 'normal'), 'recall')
  assert.equal(currentMode('normal', true, null, 'recall'), 'recall')
  assert.equal(currentMode('normal', false, 'normal', 'recall'), 'recall')
})
