require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const commands = require('../src/plugins/packs/commands.json')
const { decodeLists, validateList } = require('../src/core/wordLists.ts')

test('the command lists decode in Typle with their own ids and names', () => {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: commands }))
  assert.deepEqual(lists.map(list => [list.id, list.words.length]), [
    ['linux-commands-basic', 118], ['linux-commands-options', 146], ['linux-commands-advanced', 131],
    ['linux-shell-bash', 76], ['linux-system', 140], ['vercel-cli', 34], ['gcloud-cli', 35],
  ])
  const { initialLists } = require('../src/plugins/packs/index.ts')
  for (const list of lists) validateList(list, initialLists.filter(other => other.id !== list.id))
  assert.ok(lists.every(list => list.records.length === 0))
})

test('each command is typed as shown, in ASCII, once per list, with an explanation', () => {
  for (const list of commands) {
    assert.equal(new Set(list.words.map(word => word.input)).size, list.words.length, list.name)
    for (const word of list.words) {
      assert.equal(word.display, word.input)
      assert.match(word.input, /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/, word.input)
      assert.ok(word.annotation.trim(), word.input)
    }
  }
  const words = id => commands.find(list => list.id === id).words
  assert.deepEqual(words('linux-commands-basic')[0], { display: 'pwd', input: 'pwd', annotation: 'Print Working Directory：現在のディレクトリを表示' })
  assert.equal(words('linux-commands-basic').find(word => word.input === 'ls -la').annotation, 'ls（List）：ファイル・フォルダの一覧表示')
  assert.equal(words('linux-system').find(word => word.input === 'SIGTERM').annotation, '15番（Terminate）：正常終了の要求')
  // The source puts two commands in one row and one command in two rows.
  assert.ok(['vercel project pause', 'vercel project resume'].every(input => words('vercel-cli').some(word => word.input === input)))
  assert.equal(words('gcloud-cli').find(word => word.input === 'gcloud compute').annotation,
    'VM管理：VMの作成・起動・停止やディスクを管理（コマンドグループ） / ネットワーク管理：VPC・ファイアウォール・IPアドレスを管理（コマンドグループ）')
})
