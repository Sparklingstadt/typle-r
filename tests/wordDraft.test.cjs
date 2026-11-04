require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeWord, savedWords, draftSnapshot, draftProblems, isFilledWord } = require('../src/core/wordDraft.ts')

test('normalizeWord empties an input equal to the display and defaults the type', () => {
  assert.deepEqual(normalizeWord({ display: 'ls', input: 'ls', annotation: '' }), { display: 'ls', input: '', annotation: '', input_type: 'word' })
})
test('savedWords drops the key and uses the display for an empty input', () => {
  assert.deepEqual(savedWords([{ key: 'a', display: 'ls', input: '', annotation: '', input_type: 'word' }]), [{ display: 'ls', input: 'ls', annotation: '', input_type: 'word' }])
})
test('draftSnapshot changes with a word and ignores keys', () => {
  const word = { display: 'ls', input: '', annotation: '', input_type: 'word' }
  assert.equal(draftSnapshot('a', null, [], null, [{ ...word, key: 'x' }]), draftSnapshot('a', null, [], null, [{ ...word, key: 'y' }]))
  assert.notEqual(draftSnapshot('a', null, [], null, [word]), draftSnapshot('a', null, [], null, [{ ...word, display: 'cd' }]))
})
test('draftProblems lists the name first, then one problem per word', () => {
  const word = (key, display, input = '') => ({ key, display, input, annotation: '', input_type: 'word' })
  assert.deepEqual(draftProblems(' ', [word('a', ' '), word('b', 'ls', '  '), word('c', 'ls')]),
    [{ field: 'name' }, { field: 'display', key: 'a' }, { field: 'input', key: 'b' }])
})
test('isFilledWord is false only when every field is empty', () => {
  assert.equal(isFilledWord({ display: '', input: '', annotation: '' }), false)
  assert.equal(isFilledWord({ display: '', input: '', annotation: 'x' }), true)
})
