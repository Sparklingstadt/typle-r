require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { newSession, typeInput, sessionResult } = require('../src/core/typing.ts')

test('mistakes require correction; advance and finish exactly once', () => {
  const words = [{ input: 'ab' }, { input: 'c' }]
  let s = typeInput(newSession(), words, 'x', 1000)
  assert.equal(s.index, 0)
  assert.equal(s.mistakes, 1)
  s = typeInput(s, words, '', 1100)
  s = typeInput(s, words, 'ab', 2000)
  assert.equal(s.index, 1)
  assert.equal(s.input, '')
  s = typeInput(s, words, 'c', 3000)
  assert.deepEqual(sessionResult(s), { time: 2, mistakes: 1, accuracy: 75 })
  assert.equal(typeInput(s, words, 'c', 4000), s)
  assert.equal(newSession().finishedAt, null)
})
test('empty lists and unicode input are handled', () => {
  const s = newSession()
  assert.equal(typeInput(s, [], 'a', 0), s)
  assert.equal(typeInput(s, [{ input: 'あ😀' }], 'あ😀', 0).attempts, 2)
})
test('compareInput marks everything after the first mismatch as an error', () => {
  const { compareInput } = require('../src/core/typing.ts')
  assert.deepEqual(compareInput('hoge', '').states, ['current', 'pending', 'pending', 'pending'])
  assert.deepEqual(compareInput('hoge', 'ho').states, ['done', 'done', 'current', 'pending'])
  // The fourth character matches by position but follows a mistake, so it stays an error.
  const typo = compareInput('hoge', 'hoxe')
  assert.deepEqual(typo.states, ['done', 'done', 'error', 'error'])
  assert.equal(typo.errorIndex, 2)
  assert.deepEqual(compareInput('hoge', 'hx').states, ['done', 'error', 'current-error', 'pending'])
  const extra = compareInput('ab', 'abc')
  assert.deepEqual(extra.states, ['done', 'done'])
  assert.deepEqual(extra.extra, ['c'])
  assert.equal(extra.errorIndex, 2)
  assert.deepEqual(compareInput('あ😀', 'あ😀').states, ['done', 'done'])
  assert.equal(compareInput('あ😀', 'あ😀').errorIndex, -1)
})
test('typingSpeed counts correct characters per minute after one second', () => {
  const { typingSpeed } = require('../src/core/typing.ts')
  const s = { index: 0, input: '', startedAt: 1000, finishedAt: null, attempts: 12, mistakes: 2 }
  assert.equal(typingSpeed({ ...s, startedAt: null }, 5000), null)
  assert.equal(typingSpeed(s, 1500), null)
  assert.equal(typingSpeed(s, 3000), 300)
  assert.equal(typingSpeed({ ...s, finishedAt: 31000 }, 99999), 20)
})
test('a pause leaves its time out of elapsed time, speed and the result', () => {
  const { pauseSession, resumeSession, elapsedTime, typingSpeed } = require('../src/core/typing.ts')
  const words = [{ input: 'ab' }, { input: 'c' }]
  // Nothing to pause before the first character.
  assert.equal(pauseSession(newSession(), 500).pausedAt, null)
  let s = typeInput(newSession(), words, 'a', 1000)
  s = pauseSession(s, 3000)
  assert.equal(pauseSession(s, 4000), s)
  // The clock stands still while paused.
  assert.equal(elapsedTime(s, 60000), 2000)
  assert.equal(typingSpeed(s, 60000), 30)
  s = resumeSession(s, 63000)
  assert.equal(s.pausedAt, null)
  assert.equal(elapsedTime(s, 64000), 3000)
  assert.equal(resumeSession(s, 70000), s)
  s = typeInput(s, words, 'ab', 64000)
  s = typeInput(s, words, 'c', 65000)
  assert.deepEqual(sessionResult(s), { time: 4, mistakes: 0, accuracy: 100 })
  // A finished session is not paused.
  assert.equal(pauseSession(s, 66000), s)
})
test('typing while paused resumes the clock first', () => {
  const { pauseSession, elapsedTime } = require('../src/core/typing.ts')
  const words = [{ input: 'abc' }]
  let s = pauseSession(typeInput(newSession(), words, 'a', 1000), 2000)
  s = typeInput(s, words, 'ab', 12000)
  assert.equal(s.pausedAt, null)
  assert.equal(elapsedTime(s, 12000), 1000)
})
test('a wrong key is a mistake that keeps the position; only matching keys move on', () => {
  const { compareInput } = require('../src/core/typing.ts')
  const words = [{ input: 'Hello' }, { input: 'World' }]
  let s = typeInput(newSession(), words, 'Hell', 1000)
  s = typeInput(s, words, 'Hellx', 1100)
  assert.equal(s.input, 'Hell')
  assert.equal(s.missed, true)
  assert.deepEqual(compareInput('Hello', s.input, s.missed).states, ['done', 'done', 'done', 'done', 'current-error'])
  // Backspace has nothing to take back.
  assert.equal(typeInput(s, words, 'Hel', 1200), s)
  s = typeInput(s, words, 'Hello', 1300)
  assert.equal(s.index, 1)
  assert.equal(s.input, '')
  assert.equal(s.missed, false)
  assert.equal(s.mistakes, 1)
  assert.equal(s.attempts, 6)
  // Keys committed together carry on into the next word.
  s = typeInput(newSession(), words, 'HelloWo', 0)
  assert.equal(s.index, 1)
  assert.equal(s.input, 'Wo')
})
test('simple special-character input lets a Latin letter stand for its accented form', () => {
  const words = [{ input: 'día' }, { input: 'ř' }]
  const options = { ignoreAccents: true }
  let s = typeInput(newSession(), words, 'di', 1000, options)
  // The accented character is what goes into the input, so the word still completes.
  assert.equal(s.input, 'dí')
  assert.equal(s.mistakes, 0)
  s = typeInput(s, words, 'día', 1100, options)
  assert.equal(s.index, 1)
  s = typeInput(s, words, 'r', 1200, options)
  assert.notEqual(s.finishedAt, null)
  assert.equal(s.mistakes, 0)
  // Typing the accented character itself still counts, and a different letter is still a mistake.
  assert.equal(typeInput(newSession(), words, 'dí', 0, options).input, 'dí')
  assert.equal(typeInput(newSession(), words, 'do', 0, options).mistakes, 1)
})
test('accents still count when simple special-character input is off', () => {
  const s = typeInput(newSession(), [{ input: 'ñ' }], 'n', 0)
  assert.equal(s.mistakes, 1)
  assert.equal(s.input, '')
})
test('only Latin letters are folded', () => {
  const { matchesCharacter } = require('../src/core/typing.ts')
  const options = { ignoreAccents: true }
  for (const [typed, target] of [['i', 'í'], ['o', 'ó'], ['n', 'ñ'], ['c', 'č'], ['u', 'ů'], ['E', 'É']]) assert.ok(matchesCharacter(typed, target, options), `${typed} ${target}`)
  // Kana also split into a base and a mark, but か is not が; case still counts, and only the plain letter stands in.
  for (const [typed, target] of [['か', 'が'], ['e', 'É'], ['é', 'e'], ['é', 'ě'], ['i', 'o'], ['?', '¿']]) assert.ok(!matchesCharacter(typed, target, options), `${typed} ${target}`)
})
