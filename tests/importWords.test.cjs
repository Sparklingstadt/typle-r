require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseWordFile } = require('../src/lib/importWords.ts')

test('CSV supports BOM, CRLF, reordered headers, escaped quotes and multiline annotations', () => {
  assert.deepEqual(parseWordFile('\ufeffdisplay,input,annotation\r\n"日本,Japan",Japan,"one\r\ntwo ""quoted"""\r\n', ','), [
    { input: 'Japan', display: '日本,Japan', annotation: 'one\r\ntwo "quoted"' }
  ])
})
test('TSV allows missing annotation and blank lines', () => {
  assert.deepEqual(parseWordFile('input\tdisplay\n\nJapan\t日本\n', '\t'), [{ input: 'Japan', display: '日本', annotation: '' }])
  assert.equal(parseWordFile('input\tdisplay\tannotation\nJapan\t日本\t"a\tb"', '\t')[0].annotation, 'a\tb')
})
test('invalid imports fail rather than partially importing', () => {
  for (const text of ['display\nx', 'input,display,input\na,b,c', 'input,display,other\na,b,c', 'input,display', 'input,display\na,', 'input,display\na,b,c', 'input,display\n"a,b', 'input,display\n"a"x,b', 'input,display\na"x,b']) {
    assert.throws(() => parseWordFile(text, ','), Error, text)
  }
  assert.throws(() => parseWordFile('input,display\nok,yes\nno,', ','), /3行目/)
  assert.throws(() => parseWordFile('input,display\n' + 'a,b\n'.repeat(1001), ','), /1,000件/)
  assert.throws(() => parseWordFile('input,display\n' + 'a'.repeat(1001) + ',b', ','), /文字数/)
  assert.throws(() => parseWordFile('a'.repeat(1024 * 1024 + 1), ','), /1 MiB/)
})

test('CSV preserves whitespace and duplicates through JSON save while rejecting empty records', () => {
  const { saveList, encodeLists, decodeLists } = require('../src/lib/wordLists.ts')
  const words = parseWordFile('display,input,anotation\r\n" 字 "," zi "," a\r\nb "\r\n字,zi,\r\n字,zi,', ',')
  const list = { id: 'csv', name: 'CSV', createdAt: '2026-09-27', records: [], words }
  assert.deepEqual(decodeLists(encodeLists(saveList([], list, false)))[0].words, [
    { display: ' 字 ', input: ' zi ', annotation: ' a\r\nb ' },
    { display: '字', input: 'zi', annotation: '' },
    { display: '字', input: 'zi', annotation: '' },
  ])
  for (const row of [',,', '"","",""', '  ,  ,']) {
    assert.throws(() => parseWordFile('display,input,annotation\na,b,\n' + row, ','), /3行目/)
  }
  assert.throws(() => parseWordFile('display,input,annotation,anotation\na,b,c,d', ','), /重複/)
})
