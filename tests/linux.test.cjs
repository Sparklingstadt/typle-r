require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const linux = require('../src/plugins/packs/linux.json')
const { decodeLists, validateList } = require('../src/core/wordLists.ts')

test('the Linux lists decode in Typle with their own ids and names', () => {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: linux }))
  assert.deepEqual(lists.map(list => [list.id, list.words.length]), [
    ['linux-commands-basic', 118], ['linux-commands-options', 146], ['linux-commands-advanced', 131],
    ['linux-shell-bash', 76], ['linux-system', 140],
  ])
  const { initialLists } = require('../src/plugins/packs/index.ts')
  for (const list of lists) validateList(list, initialLists.filter(other => other.id !== list.id))
  assert.ok(lists.every(list => list.records.length === 0))
})

test('each Linux word is typed as shown, in ASCII, once per list, with an explanation', () => {
  for (const list of linux) {
    assert.equal(new Set(list.words.map(word => word.input)).size, list.words.length, list.name)
    for (const word of list.words) {
      assert.equal(word.display, word.input)
      assert.match(word.input, /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/, word.input)
      assert.ok(word.annotation.trim(), word.input)
    }
  }
  const basic = linux.find(list => list.id === 'linux-commands-basic').words
  assert.deepEqual(basic[0], { display: 'pwd', input: 'pwd', annotation: 'Print Working Directory：現在のディレクトリを表示' })
  assert.equal(basic.find(word => word.input === 'ls -la').annotation, 'ls（List）：ファイル・フォルダの一覧表示')
  const system = linux.find(list => list.id === 'linux-system').words
  assert.equal(system.find(word => word.input === 'SIGTERM').annotation, '15番（Terminate）：正常終了の要求')
})
