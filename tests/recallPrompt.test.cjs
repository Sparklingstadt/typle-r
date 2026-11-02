require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { recallPrompt, recallDisplayHint } = require('../src/core/recallPrompt.ts')

const cases = [
  ['apple', 'apple', 'apple / りんご', 'りんご'],
  ['苹果', 'pingguo', 'píngguǒ / りんご', 'りんご'],
  ['阿富汗', 'afuhan', 'Āfùhàn / アフガニスタン', 'アフガニスタン'],
  ['cp -r src dst', 'cp -r src dst', 'cp：ファイルをコピー', '＿＿：ファイルをコピー'],
  ['git status', 'git status', 'Git の状態を見る', '＿＿ の状態を見る'],
  ['42601', '42601', 'syntax_error：構文エラー', 'syntax_error：構文エラー'],
  ['ls', 'ls', 'ls', ''],
  ['hello', 'hello', '', ''],
]
for (const [display, input, annotation, expected] of cases) {
  test(`recallPrompt: ${annotation || '(empty)'}`, () => {
    assert.equal(recallPrompt({ display, input, annotation }), expected)
  })
}
test('longer candidate wins and accents are kept where not replaced', () => {
  assert.equal(
    recallPrompt({ display: 'cp', input: 'cp -r src dst', annotation: 'cp -r src dst と cp を使う' }),
    '＿＿ と ＿＿ を使う',
  )
  assert.equal(recallPrompt({ display: 'x', input: 'x', annotation: 'Éx は x' }), 'Éx は x')
})

test('recallDisplayHint shows the display only when it is not the answer', () => {
  assert.equal(recallDisplayHint({ display: '苹果', input: 'pingguo' }), '苹果')
  assert.equal(recallDisplayHint({ display: 'java - version', input: 'java -version' }), '')
  assert.equal(recallDisplayHint({ display: 'apple', input: 'apple' }), '')
  assert.equal(recallDisplayHint({ display: '苹果', input: 'pingguo', input_type: 'code' }), '')
})
