require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { read, write } = require('./fixtures/delimited/cases.json')
const { encodeWordCsv, parseWordFile } = require('../src/plugins/formats/delimited.ts')

// The cases are shared with server/internal/workspace/delimited_test.go, so both read and write word files alike.
for (const { name, delimiter, source, words, error } of read) {
  test(`reads: ${name}`, () => {
    if (words) return assert.deepEqual(parseWordFile(source, delimiter), words)
    assert.throws(() => parseWordFile(source, delimiter), thrown => {
      assert.equal(thrown.key, error.key)
      assert.equal(thrown.values.line, error.line)
      return true
    })
  })
}
for (const { name, words, csv } of write) {
  test(`writes: ${name}`, () => assert.equal(encodeWordCsv(words), csv))
}
