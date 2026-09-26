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
