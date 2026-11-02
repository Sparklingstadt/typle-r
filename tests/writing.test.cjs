require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { newSession, pauseSession, sessionResult } = require('../src/core/typing.ts')
const { normalizeWriting, matchesWriting, startWriting, judgeWriting, skipWord } = require('../src/core/writing.ts')

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/writing/match.json'), 'utf8'))
for (const c of cases) {
  test(`matchesWriting: ${c.description}`, () => {
    assert.equal(matchesWriting(c.candidates, c.target, c.language, c.options), c.expected)
  })
}

test('normalizeWriting', () => {
  assert.equal(normalizeWriting('  a   b ', 'en'), 'a b')
  assert.equal(normalizeWriting('é', 'fr'), 'é')
  assert.equal(normalizeWriting('あ　い う', 'ja'), 'あいう')
  assert.equal(normalizeWriting('한 국', 'ko'), '한 국')
})

const words = [{ display: 'ab' }, { display: 'cd' }]
const judge = (s, candidates, now, explicit) => judgeWriting(s, words, candidates, now, 'en', {}, explicit)

test('a correct word advances and counts an attempt', () => {
  const s = judge(newSession(), ['ab'], 1000, false)
  assert.equal(s.index, 1)
  assert.equal(s.attempts, 1)
  assert.equal(s.mistakes, 0)
  assert.equal(s.startedAt, 1000)
  assert.equal(s.finishedAt, null)
})

test('the last word finishes the session, and a finished session is left alone', () => {
  let s = judge(newSession(), ['ab'], 1000, false)
  s = judge(s, ['cd'], 2000, false)
  assert.equal(s.finishedAt, 2000)
  assert.equal(judge(s, ['cd'], 3000, true), s)
  assert.equal(skipWord(s, words, 3000), s)
  assert.equal(startWriting(s, 3000), s)
})

test('an explicit mismatch is a mistake and stays on the word', () => {
  const s = judge(newSession(), ['xx'], 1000, true)
  assert.equal(s.index, 0)
  assert.equal(s.attempts, 1)
  assert.equal(s.mistakes, 1)
  assert.equal(s.missed, true)
  assert.equal(judge(s, ['ab'], 2000, false).missed, false)
})

test('a silent mismatch changes nothing', () => {
  const s = newSession()
  assert.equal(judge(s, ['xx'], 1000, false), s)
})

test('an empty Enter is not a mistake', () => {
  const s = newSession()
  assert.equal(judge(s, [], 1000, true), s)
  assert.equal(judge(s, [''], 1000, true), s)
  assert.equal(judge(s, ['  '], 1000, true), s)
})

test('skipWord counts a mistake and moves on, finishing on the last word', () => {
  let s = skipWord(newSession(), words, 1000)
  assert.equal(s.index, 1)
  assert.equal(s.attempts, 1)
  assert.equal(s.mistakes, 1)
  assert.equal(s.missed, false)
  s = skipWord(s, words, 2000)
  assert.equal(s.finishedAt, 2000)
  assert.equal(s.attempts, 2)
})

test('startWriting starts the clock and resumes a pause', () => {
  let s = startWriting(newSession(), 1000)
  assert.equal(s.startedAt, 1000)
  assert.equal(startWriting(s, 1500).startedAt, 1000)
  s = pauseSession(s, 2000)
  s = startWriting(s, 5000)
  assert.equal(s.startedAt, 4000)
  assert.equal(s.pausedAt, null)
})

test('judging resumes a paused session', () => {
  let s = pauseSession(startWriting(newSession(), 1000), 2000)
  s = judge(s, ['ab'], 5000, false)
  assert.equal(s.startedAt, 4000)
  assert.equal(s.pausedAt, null)
})

test('two words with one mistake give 66.67 accuracy', () => {
  let s = judge(newSession(), ['xx'], 1000, true)
  s = judge(s, ['ab'], 2000, false)
  s = judge(s, ['cd'], 3000, false)
  assert.deepEqual(sessionResult(s), { time: 2, mistakes: 1, accuracy: 66.67 })
})
