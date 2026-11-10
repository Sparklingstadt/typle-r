require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { officialListCounts, wordMeaning, PROGRAMMING_CATEGORY, LANGUAGES_CATEGORY } = require('../src/core/landing.ts')

test('lists are counted by category, and the total counts every list', () => {
  const lists = [
    { category: PROGRAMMING_CATEGORY }, { category: PROGRAMMING_CATEGORY },
    { category: LANGUAGES_CATEGORY },
    { category: 'その他' }, {},
  ]
  assert.deepEqual(officialListCounts(lists), { programming: 2, languages: 1, total: 5 })
})

test('no lists means zero everywhere', () => {
  assert.deepEqual(officialListCounts([]), { programming: 0, languages: 0, total: 0 })
})

test('every official list falls in one of the two categories the landing page names', () => {
  const dir = path.join(__dirname, '../src/plugins/packs/commands')
  const files = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const lists = files.map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
  const counts = officialListCounts(lists)
  assert.ok(counts.programming > 0 && counts.languages > 0)
  assert.equal(counts.programming + counts.languages, counts.total)
})

test('a meaning drops the word when the annotation starts with it', () => {
  assert.equal(wordMeaning('apple', 'apple / りんご'), 'りんご')
  assert.equal(wordMeaning('爱护', 'àihù / 大切にする'), 'àihù / 大切にする')
  assert.equal(wordMeaning('pwd', 'Print Working Directory：現在のディレクトリを表示'), 'Print Working Directory：現在のディレクトリを表示')
  assert.equal(wordMeaning('ls', 'ls（List）：一覧'), 'ls（List）：一覧')
  assert.equal(wordMeaning('apple', '  '), '')
})
