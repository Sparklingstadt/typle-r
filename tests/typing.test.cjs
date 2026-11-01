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
  for (const [typed, target] of [['か', 'が'], ['e', 'É'], ['é', 'e'], ['é', 'ě'], ['i', 'o']]) assert.ok(!matchesCharacter(typed, target, options), `${typed} ${target}`)
})
test('ignoring case lets either case stand for the other, and adds the character of the word', () => {
  const words = [{ input: 'Ab' }]
  let s = typeInput(newSession(), words, 'aB', 0, { ignoreCase: true })
  assert.equal(s.mistakes, 0)
  assert.notEqual(s.finishedAt, null)
  assert.equal(typeInput(newSession(), words, 'a', 0).mistakes, 1)
  s = typeInput(newSession(), words, 'a', 0, { ignoreCase: true })
  assert.equal(s.input, 'A')
})
test('ignoring case combines with simple special-character input', () => {
  const { matchesCharacter } = require('../src/core/typing.ts')
  assert.ok(matchesCharacter('é', 'É', { ignoreCase: true }))
  assert.ok(!matchesCharacter('e', 'É', { ignoreCase: true }))
  assert.ok(matchesCharacter('e', 'É', { ignoreCase: true, ignoreAccents: true }))
  assert.ok(matchesCharacter('C', 'č', { ignoreCase: true, ignoreAccents: true }))
  assert.ok(!matchesCharacter('b', 'A', { ignoreCase: true, ignoreAccents: true }))
})

test('simple special-character input accepts ss for sharp s across keystrokes', () => {
  const words = [{ input: 'groß' }, { input: 'Straße' }]
  const options = { ignoreAccents: true }
  let s = typeInput(newSession(), words, 'gros', 1000, options)
  assert.equal(s.input, 'gro')
  assert.equal(s.index, 0)
  assert.equal(s.mistakes, 0)
  // The input field contains only committed target characters between events.
  s = typeInput(s, words, s.input + 's', 1100, options)
  assert.equal(s.index, 1)
  s = typeInput(s, words, 'Strasse', 1200, options)
  assert.notEqual(s.finishedAt, null)
  assert.equal(s.mistakes, 0)
  assert.equal(s.attempts, 12)
})

test('sharp s requires both letters and recovers from a wrong second letter', () => {
  const words = [{ input: 'ßa' }]
  const options = { ignoreAccents: true }
  let s = typeInput(newSession(), words, 's', 0, options)
  s = typeInput(s, words, 'a', 100, options)
  assert.equal(s.input, '')
  assert.equal(s.mistakes, 1)
  assert.equal(s.missed, true)
  s = typeInput(s, words, 'sa', 200, options)
  assert.equal(s.input, 'ßa')
  assert.equal(s.missed, false)
  assert.notEqual(s.finishedAt, null)
  assert.equal(s.mistakes, 1)
})

test('sharp s alternatives respect special-character and case settings', () => {
  for (const options of [{}, { ignoreCase: true }]) {
    const s = typeInput(newSession(), [{ input: 'ß' }], 'ss', 0, options)
    assert.equal(s.finishedAt, null)
    assert.equal(s.mistakes, 2)
  }
  assert.equal(typeInput(newSession(), [{ input: 'ß' }], 'SS', 0, { ignoreAccents: true }).mistakes, 2)
  for (const [target, value, options] of [
    ['ß', 'ß', {}],
    ['ß', 'ß', { ignoreAccents: true }],
    ['ẞ', 'SS', { ignoreAccents: true }],
    ['ß', 'Ss', { ignoreAccents: true, ignoreCase: true }],
    ['ẞ', 'ss', { ignoreAccents: true, ignoreCase: true }],
  ]) {
    const s = typeInput(newSession(), [{ input: target }], value, 0, options)
    assert.notEqual(s.finishedAt, null, `${target}: ${value}`)
    assert.equal(s.mistakes, 0)
  }
})

test('simple special-character input accepts ? for the Spanish opening question mark', () => {
  const words = [{ input: '¿Qué?' }]
  const options = { ignoreAccents: true }
  let s = typeInput(newSession(), words, '?', 0, options)
  assert.equal(s.input, '¿')
  assert.equal(s.mistakes, 0)
  s = typeInput(s, words, s.input + 'Que?', 100, options)
  assert.equal(s.input, '¿Qué?')
  assert.notEqual(s.finishedAt, null)
  assert.equal(s.mistakes, 0)
  assert.equal(s.attempts, 5)
})

test('opening question mark substitution requires simple input and is one-way', () => {
  const { matchesCharacter } = require('../src/core/typing.ts')
  for (const options of [{}, { ignoreCase: true }]) {
    const s = typeInput(newSession(), [{ input: '¿' }], '?', 0, options)
    assert.equal(s.input, '')
    assert.equal(s.mistakes, 1)
    assert.equal(s.finishedAt, null)
  }
  assert.equal(matchesCharacter('¿', '?', { ignoreAccents: true }), false)
  for (const options of [{}, { ignoreAccents: true }]) {
    assert.equal(typeInput(newSession(), [{ input: '¿' }], '¿', 0, options).finishedAt, 0)
  }
})

test('simple input accepts the Russian alphabet through Latin keystrokes', () => {
  const words = [{ input: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя' }]
  const latin = 'abvgdeyozhziyklmnoprstufkhtschshshch"y\'eyuya'
  let s = newSession()
  for (const char of latin) s = typeInput(s, words, s.input + char, 100, { ignoreAccents: true })
  assert.equal(s.input, words[0].input)
  assert.equal(s.finishedAt, 100)
  assert.equal(s.mistakes, 0)
  assert.equal(s.attempts, latin.length)
})

test('Cyrillic transliteration accepts batched text and carries on across words', () => {
  const s = typeInput(newSession(), [{ input: 'привет' }, { input: 'школа' }, { input: 'я' }], 'privetshkolaya', 100, { ignoreAccents: true })
  assert.equal(s.index, 2)
  assert.equal(s.input, 'я')
  assert.equal(s.finishedAt, 100)
  assert.equal(s.mistakes, 0)
})

test('Cyrillic multi-key input waits for completion and retains progress after a mistake', () => {
  const words = [{ input: 'ща' }]
  const options = { ignoreAccents: true }
  let s = typeInput(newSession(), words, 'sh', 100, options)
  assert.equal(s.input, '')
  assert.equal(s.finishedAt, null)
  assert.equal(s.mistakes, 0)
  s = typeInput(s, words, 'x', 200, options)
  assert.equal(s.input, '')
  assert.equal(s.missed, true)
  s = typeInput(s, words, 'cha', 300, options)
  assert.equal(s.input, 'ща')
  assert.equal(s.finishedAt, 300)
  assert.equal(s.missed, false)
  assert.equal(s.mistakes, 1)
  assert.equal(s.attempts, 6)
})

test('direct Cyrillic input can complete a pending transliteration without leaking progress', () => {
  const words = [{ input: 'шя' }]
  const options = { ignoreAccents: true }
  let s = typeInput(newSession(), words, 's', 100, options)
  s = typeInput(s, words, 'шya', 200, options)
  assert.equal(s.input, 'шя')
  assert.equal(s.finishedAt, 200)
  assert.equal(s.mistakes, 0)
  assert.equal(typeInput(newSession(), words, 'шя', 100).finishedAt, 100)
})

test('Cyrillic alternatives respect simple-input and case settings', () => {
  const { matchesCharacter } = require('../src/core/typing.ts')
  for (const options of [{}, { ignoreCase: true }]) {
    const s = typeInput(newSession(), [{ input: 'я' }], 'ya', 100, options)
    assert.equal(s.finishedAt, null)
    assert.equal(s.mistakes, 2)
  }
  for (const [target, value, options] of [
    ['Яна', 'Yana', { ignoreAccents: true }],
    ['Ш', 'Sh', { ignoreAccents: true }],
    ['Ш', 'SH', { ignoreAccents: true }],
    ['Ш', 'sh', { ignoreAccents: true, ignoreCase: true }],
    ['я', 'YA', { ignoreAccents: true, ignoreCase: true }],
  ]) {
    const s = typeInput(newSession(), [{ input: target }], value, 100, options)
    assert.equal(s.finishedAt, 100, `${target}: ${value}`)
    assert.equal(s.mistakes, 0)
  }
  assert.equal(typeInput(newSession(), [{ input: 'Я' }], 'ya', 100, { ignoreAccents: true }).finishedAt, null)
  assert.equal(typeInput(newSession(), [{ input: 'я' }], 'Ya', 100, { ignoreAccents: true }).finishedAt, null)
  assert.equal(matchesCharacter('p', 'п', { ignoreAccents: true }), true)
  assert.equal(matchesCharacter('ya', 'я', { ignoreAccents: true }), true)
  assert.equal(matchesCharacter('п', 'p', { ignoreAccents: true }), false)
})
test('simpleInputKeys lists the characters simple input folds, once each, with their key', () => {
  const { simpleInputKeys } = require('../src/core/typing.ts')
  assert.deepEqual(simpleInputKeys('café crème'), [['é', 'e'], ['è', 'e']])
  assert.deepEqual(simpleInputKeys('Шишка'), [['Ш', 'Sh'], ['и', 'i'], ['ш', 'sh'], ['к', 'k'], ['а', 'a']])
  assert.deepEqual(simpleInputKeys('¿Straße?'), [['¿', '?'], ['ß', 'ss']])
  // Plain letters, kana and letters without a plain base (ł) have nothing to show.
  assert.deepEqual(simpleInputKeys('hello がか łódź'), [['ó', 'o'], ['ź', 'z']])
})
