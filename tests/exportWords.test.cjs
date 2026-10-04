require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { encodeWordCsv, parseWordFile } = require('../src/plugins/formats/delimited.ts')
const { csvFormat, importAccept, importFormat, tsvFormat, wordFilename } = require('../src/plugins/formats/index.ts')
const wordCsvFilename = name => wordFilename(name, csvFormat)

test('exported CSV round-trips Unicode, exact whitespace, duplicates, quotes and newlines', () => {
  const words = [
    { input: ' zi ', display: ' 字,日本 ', annotation: 'one\r\ntwo "quoted"\t' },
    { input: '=literal', display: '😀', annotation: '' },
    { input: '=literal', display: '😀', annotation: '' },
  ]
  const original = structuredClone(words)
  const csv = encodeWordCsv(words)
  assert.ok(csv.startsWith('\ufeffinput,display,annotation\r\n'))
  assert.deepEqual(parseWordFile(csv, ','), original)
  assert.deepEqual(words, original)
})

test('filenames retain readable names and remove path and reserved characters', () => {
  assert.equal(wordCsvFilename('中国語'), '中国語.csv')
  assert.equal(wordCsvFilename('../a:b\\c?'), '_a_b_c_.csv')
  assert.equal(wordCsvFilename('...'), 'word-list.csv')
  assert.equal(wordCsvFilename('CON'), '_CON.csv')
  assert.equal(wordCsvFilename('a'.repeat(200)).length, 84)
})

test('files are read by their extension, in any case, and other files are refused', () => {
  assert.equal(importFormat('words.csv'), csvFormat)
  assert.equal(importFormat('Words.TSV'), tsvFormat)
  assert.equal(importFormat('words.txt'), undefined)
  assert.equal(importAccept, '.csv,.tsv')
  assert.deepEqual(tsvFormat.parse('input\tdisplay\nzi\t字'), [{ input: 'zi', display: '字', annotation: '' }])
  assert.equal(wordFilename('中国語', tsvFormat), '中国語.tsv')
})
