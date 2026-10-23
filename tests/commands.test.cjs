require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const commands = require('../src/plugins/packs/commands.json')
const { decodeLists, validateList } = require('../src/core/wordLists.ts')

const words = id => commands.find(list => list.id === id).words

test('the command lists decode in Typle with their own ids and names', () => {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: commands }))
  assert.deepEqual(lists.map(list => [list.id, list.words.length]), [
    ['linux-commands-basic', 118], ['linux-commands-options', 146], ['linux-commands-advanced', 131],
    ['linux-shell-bash', 76], ['linux-system', 140], ['vercel-cli', 34], ['gcloud-cli', 35], ['aws-cli', 46], ['macos-zsh', 90], ['arch-linux', 96],
  ])
  const { initialLists } = require('../src/plugins/packs/index.ts')
  for (const list of lists) validateList(list, initialLists.filter(other => other.id !== list.id))
  assert.ok(lists.every(list => list.records.length === 0))
})

test('each command is typed as shown, in ASCII, once per list, with an explanation', () => {
  // Some zsh examples echo or say Japanese text and two Arch examples name a placeholder in Japanese, typed with the IME.
  const japanese = ['say "こんにちは"', 'echo "追加" >> memo.txt', 'command -v node || echo "見つかりません"', 'echo "現在地: $(pwd)"',
    'git clone https://aur.archlinux.org/パッケージ名.git', 'systemctl --user status 名前']
  for (const list of commands) {
    assert.equal(new Set(list.words.map(word => word.input)).size, list.words.length, list.name)
    for (const word of list.words) {
      assert.equal(word.display, word.input)
      assert.match(japanese.includes(word.input) ? word.input.replace(/[^\x20-\x7e]/g, 'x') : word.input,
        /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/, word.input)
      assert.ok(word.annotation.trim(), word.input)
    }
  }
  assert.ok(japanese.every(input => commands.some(list => list.words.some(word => word.input === input))))
  assert.deepEqual(words('linux-commands-basic')[0], { display: 'pwd', input: 'pwd', annotation: 'Print Working Directory：現在のディレクトリを表示' })
  assert.equal(words('linux-commands-basic').find(word => word.input === 'ls -la').annotation, 'ls（List）：ファイル・フォルダの一覧表示')
  assert.equal(words('linux-system').find(word => word.input === 'SIGTERM').annotation, '15番（Terminate）：正常終了の要求')
  // The source puts two commands in one row and one command in two rows.
  assert.ok(['vercel project pause', 'vercel project resume'].every(input => words('vercel-cli').some(word => word.input === input)))
  assert.equal(words('gcloud-cli').find(word => word.input === 'gcloud compute').annotation,
    'VM管理：VMの作成・起動・停止やディスクを管理（コマンドグループ） / ネットワーク管理：VPC・ファイアウォール・IPアドレスを管理（コマンドグループ）')
})

test('the zsh list leaves out key presses and keeps one word per example', () => {
  const zsh = words('macos-zsh')
  assert.ok(!zsh.some(word => /Control|Command|Tab|↑/.test(word.input)))
  assert.equal(zsh.find(word => word.input === 'open .').annotation, '.：現在のフォルダを表す（パスの記号） / Finderで現在のフォルダを開く')
  assert.equal(zsh.find(word => word.input === 'project=ffpf-portal').annotation, '名前=値：シェル変数を設定')
  assert.equal(words('aws-cli').find(word => word.input === 'aws sts get-caller-identity').annotation,
    'STS：操作中のアカウント・権限を確認（Account・Arn・UserIdを確認）')
})

test('migrations 0009 and 0010 add the command lists to saved workspaces', () => {
  const fs = require('node:fs')
  const added = ['0009_seed_command_lists', '0010_seed_arch_linux_list'].flatMap(name => {
    const sql = fs.readFileSync(require.resolve(`../prisma/migrations/${name}/migration.sql`), 'utf8')
    const literal = sql.match(/jsonb_array_elements\('(.*)'::jsonb\)/)[1].replaceAll("''", "'")
    return decodeLists(JSON.stringify({ version: 1, lists: JSON.parse(literal) }))
  })
  assert.deepEqual(added.map(list => list.id), commands.map(list => list.id))
  assert.ok(added.every(list => list.records.length === 0))
})

test('the Arch list keeps one word per example', () => {
  const arch = words('arch-linux')
  assert.equal(arch.find(word => word.input === 'sudo pacman -Syu').annotation,
    'DB更新とシステム全体の更新（部分更新は非サポート。-Syだけ実行して一部を導入しない） / sudo：管理者権限で実行（sudoの導入と権限設定が必要）')
  assert.equal(arch.find(word => word.input === 'makepkg -si').annotation,
    '依存導入・ビルド・インストール（取得したフォルダ内で一般ユーザーとして実行。sudo makepkgは使わない）')
})
