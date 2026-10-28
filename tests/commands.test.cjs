require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const commands = require('../src/plugins/packs/commands/index.ts').default
const { decodeLists, validateList } = require('../src/core/wordLists.ts')

test('the split command lists follow the shared manifest without missing or duplicate files', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const directory = path.join(__dirname, '../src/plugins/packs/commands')
  const names = require('../src/plugins/packs/commands/manifest.json')
  assert.equal(new Set(names).size, names.length)
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.json') && name !== 'manifest.json').sort(), [...names].sort())
  assert.deepEqual(commands, names.map(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))))
})

// Since v0.85.0 the official lists are a copy of the lists of the sparklingstadt account, in its order and without its
// records. Some lists are kept both whole and as their 初級, 中級 and 上級 parts (`<id>-beginner`, `<id>-intermediate-1`,
// ...); words(id) gives the whole list, or joins the parts when there is none. named(name) gives the words of a list
// the account made itself, under an id of its own; some of those names were saved with a decomposed ド, kept as saved.
const level = /-(beginner|intermediate|advanced)(-\d)?$/
const source = id => id.replace(level, '')
const parts = id => commands.filter(list => list.id !== id && source(list.id) === id)
const words = id => (commands.find(list => list.id === id) ? [commands.find(list => list.id === id)] : parts(id)).flatMap(list => list.words)
const named = name => commands.find(list => list.name.normalize('NFC') === name).words
const sources = [...new Set(commands.map(list => source(list.id)))]
const sorted = list => [...list].sort((a, b) => a.input < b.input ? -1 : a.input > b.input ? 1 : 0)
// The lists of v0.75.0 come in three levels whatever their length.
const leveled = ['typescript-syntax', 'hono-methods', 'php-syntax', 'rails-methods', 'express-methods', 'oracle-plsql-syntax', 'sql-server-tsql-syntax']

test('the initial lists decode in Typle with their own ids and names', () => {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: commands }))
  assert.deepEqual(require('../src/plugins/packs/samples.json'), [])
  assert.deepEqual(require('../src/plugins/packs/countries.json'), [])
  assert.deepEqual(sources.map(id => [id, commands.filter(list => source(list.id) === id).map(list => list.words.length)]), [
    ['8f3cf116-1f9f-4579-a071-e600094b104d', [90]], ['ef974a4b-3c7a-4eeb-9979-6721a0a1c81a', [46]], ['d6a056c2-9f2b-48ba-b4e6-1d851cc45f41', [35]],
    ['04450fbe-2974-417c-9350-39802a5c650c', [140]], ['d3638812-0c0a-4f37-a413-d17404344c32', [76]], ['3099bf52-7790-49b0-841d-5230d7d3dd68', [131]],
    ['78aaf407-fd11-4b12-92bd-2f0bffaf3779', [146]], ['0b27f311-38aa-40aa-9c29-ea17e374e1fe', [118]], ['eba3ec64-7d45-4f41-9de1-200ba5e957d5', [34]],
    ['arch-linux', [96, 32, 32, 32]], ['vim', [112, 38, 37, 37]], ['go-syntax', [109, 37, 36, 36]],
    ['java-syntax', [33, 33, 32, 32]], ['kotlin-syntax', [33, 33, 33, 32, 32]], ['un-member-states-chinese-193-lowercase', [193, 39, 39, 39, 38, 38]],
    ['postgresql-syntax', [38, 38, 38, 38]], ['prisma-syntax', [32, 32]], ['jest-syntax', [34, 33]], ['playwright-syntax', [35, 35]],
    ['typescript-syntax', [18, 18, 18]], ['hono-methods', [12, 12, 12]], ['php-syntax', [14, 14, 13]], ['rails-methods', [15, 15, 14]],
    ['express-methods', [12, 12, 11]], ['oracle-plsql-syntax', [13, 12, 12]], ['sql-server-tsql-syntax', [15, 15, 15]],
  ])
  assert.equal(lists.length, commands.length)
  const { initialLists } = require('../src/plugins/packs/index.ts')
  assert.deepEqual(initialLists, commands)
  for (const list of lists) validateList(list, initialLists.filter(other => other.id !== list.id))
  assert.ok(lists.every(list => list.records.length === 0))
})

test('a list kept both whole and in parts holds the same words in each', () => {
  for (const id of ['arch-linux', 'vim', 'go-syntax', 'un-member-states-chinese-193-lowercase']) {
    assert.deepEqual(sorted(parts(id).flatMap(list => list.words)), sorted(words(id)), id)
  }
})

test('a list split into parts has the fewest parts of at most 40, from the easiest words to type to the hardest', () => {
  // The lists of v0.75.0 are split into at least three levels. A list kept whole beside its parts is left out.
  const { initialLists } = require('../src/plugins/packs/index.ts')
  // A symbol or a Japanese character counts as two letters. The first word introduces the list, so it opens 初級.
  const score = word => [...word.input.toLowerCase()].reduce((sum, c) => sum + (/[a-z0-9 ]/.test(c) ? 1 : 2), 0)
  const labels = { 2: ['初級', '上級'], 3: ['初級', '中級', '上級'], 4: ['初級', '中級1', '中級2', '上級'], 5: ['初級1', '初級2', '中級', '上級1', '上級2'] }
  const grouped = [...new Set(initialLists.map(list => source(list.id)))]
    .map(id => initialLists.filter(list => list.id !== id && source(list.id) === id)).filter(group => group.length > 1)
  assert.equal(grouped.length, 17)
  for (const group of grouped) {
    const total = group.reduce((sum, list) => sum + list.words.length, 0)
    assert.equal(group.length, Math.max(Math.ceil(total / 40), leveled.includes(source(group[0].id)) ? 3 : 1), group[0].id)
    assert.ok(group.every(list => Math.abs(list.words.length - total / group.length) < 1), group[0].id)
    assert.deepEqual(group.map(list => list.name.match(/（(?:小文字・)?([^（）]+)）$/)[1]), labels[group.length], group[0].id)
    const scores = group.map((list, index) => (index ? list.words : list.words.slice(1)).map(score))
    for (let index = 1; index < scores.length; index++) {
      assert.ok(Math.max(...scores[index - 1]) <= Math.min(...scores[index]), group[index].id)
    }
  }
})

test('each command is typed as shown, in ASCII, once per list, with an explanation', () => {
  // Some zsh examples echo or say Japanese text, and some Arch and Vim examples name a placeholder in Japanese, typed
  // with the IME.
  const japanese = ['say "こんにちは"', 'echo "追加" >> memo.txt', 'command -v node || echo "見つかりません"', 'echo "現在地: $(pwd)"',
    'git clone https://aur.archlinux.org/パッケージ名.git', 'systemctl --user status 名前',
    ':w 名前', ':saveas パス', '/文字列', '?文字列', '/\\V文字列', ':sp ファイル', ':vsp ファイル']
  // The lowercase country list shows the Chinese name; its own test below checks it.
  for (const list of commands.filter(list => source(list.id) !== 'un-member-states-chinese-193-lowercase')) {
    assert.equal(new Set(list.words.map(word => word.input)).size, list.words.length, list.name)
    for (const word of list.words) {
      // Display-only line breaks can replace one space or sit between code tokens.
      const chunks = word.display.split('\n').map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      assert.match(word.input, new RegExp(`^${chunks.join(' ?')}$`))
      // Go, Java, Kotlin, PostgreSQL, Prisma, Jest and Playwright examples hold Japanese strings and comments.
      assert.match(['go-syntax', 'java-syntax', 'kotlin-syntax', 'postgresql-syntax', 'prisma-syntax', 'jest-syntax', 'playwright-syntax', ...leveled].includes(source(list.id)) || japanese.includes(word.input) ? word.input.replace(/[^\x20-\x7e]/g, 'x') : word.input,
        /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/, word.input)
      assert.ok(word.annotation.trim(), word.input)
    }
  }
  assert.ok(japanese.every(input => commands.some(list => list.words.some(word => word.input === input))))
  assert.deepEqual(named('Linuxコマンド：基本')[0], { display: 'pwd', input: 'pwd', annotation: 'Print Working Directory：現在のディレクトリを表示' })
  assert.equal(named('Linuxコマンド：基本').find(word => word.input === 'ls -la').annotation, 'ls（List）：ファイル・フォルダの一覧表示')
  assert.equal(named('Linux：システムの仕組み').find(word => word.input === 'SIGTERM').annotation, '15番（Terminate）：正常終了の要求')
  // The source puts two commands in one row and one command in two rows.
  assert.ok(['vercel project pause', 'vercel project resume'].every(input => named('Vercel CLIコマンド').some(word => word.input === input)))
  assert.equal(named('Google Cloud CLI（gcloud）コマンド').find(word => word.input === 'gcloud compute').annotation,
    'VM管理：VMの作成・起動・停止やディスクを管理（コマンドグループ） / ネットワーク管理：VPC・ファイアウォール・IPアドレスを管理（コマンドグループ）')
})

test('the zsh list leaves out key presses and keeps one word per example', () => {
  const zsh = named('macOSターミナル（zsh）コマンド')
  assert.ok(!zsh.some(word => /Control|Command|Tab|↑/.test(word.input)))
  assert.equal(zsh.find(word => word.input === 'open .').annotation, '.：現在のフォルダを表す（パスの記号） / Finderで現在のフォルダを開く')
  assert.equal(zsh.find(word => word.input === 'project=ffpf-portal').annotation, '名前=値：シェル変数を設定')
  assert.equal(named('AWS CLIコマンド').find(word => word.input === 'aws sts get-caller-identity').annotation,
    'STS：操作中のアカウント・権限を確認（Account・Arn・UserIdを確認）')
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

test('the Kotlin list types each code example on one line, ending statements where Kotlin does', () => {
  const kotlin = words('kotlin-syntax')
  assert.ok(kotlin.every(word => !/[\n\t]/.test(word.input)))
  assert.ok(kotlin.some(word => word.input === 'val label = when (role) { "admin" -> "管理者"; "member", "guest" -> "一般利用者"; else -> "不明" }'))
  assert.ok(kotlin.some(word => word.input === 'val isAdult: Boolean get() = age >= 20'))
  assert.ok(kotlin.some(word => word.input === 'val result = names.filter { it.length >= 3 }.map { it.uppercase() }'))
  assert.ok(kotlin.some(word => word.input === 'val text = """1行目 2行目"""'))
  assert.equal(kotlin.find(word => word.input === 'val sameReference = a === b').annotation, '===：参照の同一性（プリミティブ相当値等の同一性に依存しない）')
})

test('the lowercase country list types the pinyin of the country list in lowercase, spaces kept', () => {
  const lower = words('un-member-states-chinese-193-lowercase')
  assert.equal(new Set(lower.map(word => word.display)).size, 193)
  assert.ok(lower.every(word => /^[a-z]+( [a-z]+)*$/.test(word.input)))
  assert.equal(lower.find(word => word.display === '安提瓜和巴布达').input, 'antigua he babuda')
  assert.equal(lower.find(word => word.display === '菲律宾').input, 'feilvbin')
})

test('the PostgreSQL list types each SQL example on one line, with no line comment cutting it short', () => {
  const sql = words('postgresql-syntax')
  assert.ok(sql.every(word => !/[\n\t]/.test(word.input) && !word.input.includes('--')))
  assert.ok(sql.some(word => word.input === '/* 1行コメント */ SELECT /* ブロックコメント */ 1;'))
  assert.ok(sql.some(word => word.input === 'WITH totals AS (SELECT user_id, SUM(amount) AS total FROM orders GROUP BY user_id) SELECT * FROM totals WHERE total >= 1000;'))
  assert.equal(sql.find(word => word.input === 'SELECT * FROM users WHERE age <> 20;').annotation, '比較演算子：比較（NULLとの通常比較は真偽がunknownになる）')
  assert.equal(sql.find(word => word.input === 'SELECT * FROM users WHERE email IS NULL;').annotation, 'IS NULL / IS NOT NULL：NULLの判定')
})

test('the Prisma, Jest and Playwright lists type each code example on one line and each command as its own word', () => {
  const code = ['prisma-syntax', 'jest-syntax', 'playwright-syntax'].flatMap(words)
  assert.ok(code.every(word => !/[\n\t]/.test(word.input) && !/\S \/\/ /.test(word.input)))
  // Lines join with a space, and with no space or trailing comma inside the brackets of a call or an array.
  assert.ok(code.every(word => !/[([] |,? [)\]]|, }/.test(word.input)), code.find(word => /[([] |,? [)\]]|, }/.test(word.input))?.input)
  const prisma = words('prisma-syntax')
  assert.ok(prisma.some(word => word.input === 'model Note { id Int @id @default(autoincrement()) body String }'))
  assert.ok(prisma.some(word => word.input === 'await prisma.$transaction([prisma.user.update({ where: { id: 1 }, data: { active: true } }), prisma.post.updateMany({ where: { authorId: 1 }, data: { published: true } })]);'))
  assert.ok(['npx prisma format', 'npx prisma validate'].every(input => prisma.find(word => word.input === input).annotation === 'prisma format / validate：スキーマ整形・検証（ターミナルで実行）'))
  assert.equal(words('jest-syntax').find(word => word.input === 'expect(1 + 2).toBe(3);').annotation, 'toBe：Object.is相当の比較（オブジェクト内容の比較はtoEqual等）')
  assert.ok(words('playwright-syntax').some(word => word.input === "import { devices } from '@playwright/test'; /* defineConfig内: */ /* projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }] */"))
  assert.ok(words('playwright-syntax').some(word => word.input === 'npx playwright test --headed'))
})

test('the TypeScript, Hono, PHP, Rails, Express, PL/SQL and T-SQL lists type each example on one line', () => {
  const all = leveled.flatMap(words)
  assert.ok(all.every(word => !/[\n\t]/.test(word.input)))
  // TypeScript, Hono and Express join lines as the Prisma, Jest and Playwright lists do.
  const js = ['typescript-syntax', 'hono-methods', 'express-methods'].flatMap(words)
  assert.ok(js.every(word => !/\S \/\/ /.test(word.input) && !/[([] |,? [)\]]|, }/.test(word.input)), js.find(word => /[([] |,? [)\]]|, }/.test(word.input))?.input)
  assert.ok(['npm install hono @hono/node-server', 'npx tsx src/index.ts'].every(input => words('hono-methods').some(word => word.input === input)))
  // Ruby ends a statement at a newline, so the Rails examples join with "; ".
  const rails = words('rails-methods')
  assert.ok(rails.some(word => word.input === 'User.transaction do; user = User.create!(name: \'Pomo\',email: \'tx@example.com\'); user.posts.create!(title: \'Hello\'); end'))
  assert.ok(['redirect_to users_path, status: :see_other', 'head :no_content', 'bin/rails db:migrate'].every(input => rails.some(word => word.input === input)))
  assert.ok(words('php-syntax').some(word => word.input === '<?php declare(strict_types=1); echo "Hello\\n";'))
  // The SQL*Plus "/" is not typed; the T-SQL "GO" is a word of its own.
  const plsql = words('oracle-plsql-syntax')
  assert.ok(plsql.every(word => !/(^|\s)\/($|\s)/.test(word.input)))
  assert.ok(plsql.some(word => word.input === 'CREATE OR REPLACE PACKAGE math_api AS FUNCTION twice(n NUMBER) RETURN NUMBER; END;'))
  const tsql = words('sql-server-tsql-syntax')
  assert.ok(['SELECT 1;', 'GO', '/* コメント */ SELECT 2;'].every(input => tsql.some(word => word.input === input)))
  assert.ok(tsql.some(word => word.input.startsWith('CREATE TABLE dbo.Users (Id int IDENTITY(1,1) PRIMARY KEY, ')))
})
