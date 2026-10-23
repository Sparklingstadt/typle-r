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
    ['linux-shell-bash', 76], ['linux-system', 140], ['vercel-cli', 34], ['gcloud-cli', 35], ['aws-cli', 46], ['macos-zsh', 90], ['arch-linux', 96], ['vim', 112], ['go-syntax', 109], ['java-syntax', 130],
  ])
  const { initialLists } = require('../src/plugins/packs/index.ts')
  for (const list of lists) validateList(list, initialLists.filter(other => other.id !== list.id))
  assert.ok(lists.every(list => list.records.length === 0))
})

test('each command is typed as shown, in ASCII, once per list, with an explanation', () => {
  // Some zsh examples echo or say Japanese text, and some Arch and Vim examples name a placeholder in Japanese, typed
  // with the IME.
  const japanese = ['say "こんにちは"', 'echo "追加" >> memo.txt', 'command -v node || echo "見つかりません"', 'echo "現在地: $(pwd)"',
    'git clone https://aur.archlinux.org/パッケージ名.git', 'systemctl --user status 名前',
    ':w 名前', ':saveas パス', '/文字列', '?文字列', '/\\V文字列', ':sp ファイル', ':vsp ファイル']
  for (const list of commands) {
    assert.equal(new Set(list.words.map(word => word.input)).size, list.words.length, list.name)
    for (const word of list.words) {
      assert.equal(word.display, word.input)
      // Go and Java code examples hold Japanese strings and comments.
      assert.match(['go-syntax', 'java-syntax'].includes(list.id) || japanese.includes(word.input) ? word.input.replace(/[^\x20-\x7e]/g, 'x') : word.input,
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

test('migrations 0009 to 0013 add the command lists to saved workspaces', () => {
  const fs = require('node:fs')
  const added = ['0009_seed_command_lists', '0010_seed_arch_linux_list', '0011_seed_vim_list', '0012_seed_go_syntax_list', '0013_seed_java_syntax_list'].flatMap(name => {
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

test('the Vim list leaves out key presses and types the examples the source gives', () => {
  const vim = words('vim')
  assert.ok(!vim.some(word => /Esc|Ctrl|→|選択中/.test(word.input)))
  assert.equal(vim.find(word => word.input === ':e ./memo.txt').annotation, ':e パス：別のファイルを開く（例：:e ./memo.txt）')
  assert.equal(vim.find(word => word.input === 'y').annotation, 'ビジュアルモードで選択中：選択範囲をコピー')
  assert.equal(vim.find(word => word.input === 'di"').annotation, '二重引用符の内側を削除（対象範囲を認識できる位置で実行）')
})

test('the Go list types each code example on one line, as Go reads it', () => {
  const go = words('go-syntax')
  assert.ok(go.every(word => !/[\n\t]/.test(word.input)))
  assert.equal(go.find(word => word.input.startsWith('switch role')).input,
    'switch role { case "admin": fmt.Println("管理者"); case "member", "guest": fmt.Println("一般利用者"); default: fmt.Println("不明") }')
  assert.ok(go.some(word => word.input === 'import ( "fmt"; "errors" )'))
  assert.ok(go.some(word => word.input === '/* 複数行の コメント */'))
  assert.equal(go.find(word => word.input === 'same := a == b').annotation, '== / !=：等値・不等値比較（比較できない型もある）')
  assert.equal(go.find(word => word.input.startsWith('func Equal')).annotation, '[T comparable]：比較可能な型に制限')
})

test('the Java list types each code example on one line, with no line comment cutting it short', () => {
  const java = words('java-syntax')
  assert.ok(java.every(word => !/[\n\t]/.test(word.input)))
  assert.ok(java.every(word => word.input === '// コメント' || !word.input.includes('//')))
  assert.ok(java.some(word => word.input === 'void load() throws IOException { /* 読み込み処理 */ }'))
  assert.equal(java.find(word => word.input === 'age = 21;').annotation, '=：代入（宣言済み変数へ代入）')
  assert.equal(java.find(word => word.input === 'boolean same = a == b;').annotation, '== / !=：等値・不等値比較（参照型の==は参照の同一性を比較）')
})
