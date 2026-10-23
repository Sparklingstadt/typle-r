require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const commands = require('../src/plugins/packs/commands.json')
const { decodeLists, validateList } = require('../src/core/wordLists.ts')

// A list over 40 words is kept as its 初級, 中級 and 上級 parts (`<id>-beginner`, `<id>-intermediate-1`, ...), and words(id)
// joins them again.
const level = /-(beginner|intermediate|advanced)(-\d)?$/
const source = id => id.replace(level, '')
const parts = id => commands.filter(list => source(list.id) === id)
const words = id => parts(id).flatMap(list => list.words)
const sources = [...new Set(commands.map(list => source(list.id)))]
// The lists of v0.75.0 come in three levels whatever their length, and migration 0019 adds them.
const leveled = ['typescript-syntax', 'hono-methods', 'php-syntax', 'rails-methods', 'express-methods', 'oracle-plsql-syntax', 'sql-server-tsql-syntax']

test('the command lists decode in Typle with their own ids and names', () => {
  const lists = decodeLists(JSON.stringify({ version: 1, lists: commands }))
  assert.deepEqual(sources.map(id => [id, parts(id).map(list => list.words.length)]), [
    ['linux-commands-basic', [40, 39, 39]], ['linux-commands-options', [37, 37, 36, 36]], ['linux-commands-advanced', [33, 33, 33, 32]],
    ['linux-shell-bash', [38, 38]], ['linux-system', [35, 35, 35, 35]], ['vercel-cli', [34]], ['gcloud-cli', [35]], ['aws-cli', [23, 23]],
    ['macos-zsh', [30, 30, 30]], ['arch-linux', [32, 32, 32]], ['vim', [38, 37, 37]], ['go-syntax', [37, 36, 36]],
    ['java-syntax', [33, 33, 32, 32]], ['kotlin-syntax', [33, 33, 33, 32, 32]], ['un-member-states-chinese-193-lowercase', [39, 39, 39, 38, 38]],
    ['postgresql-syntax', [38, 38, 38, 38]], ['prisma-syntax', [32, 32]], ['jest-syntax', [34, 33]], ['playwright-syntax', [35, 35]],
    ['typescript-syntax', [18, 18, 18]], ['hono-methods', [12, 12, 12]], ['php-syntax', [14, 14, 13]], ['rails-methods', [15, 15, 14]],
    ['express-methods', [12, 12, 11]], ['oracle-plsql-syntax', [13, 12, 12]], ['sql-server-tsql-syntax', [15, 15, 15]],
  ])
  assert.equal(lists.length, commands.length)
  const { initialLists } = require('../src/plugins/packs/index.ts')
  for (const list of lists) validateList(list, initialLists.filter(other => other.id !== list.id))
  assert.ok(lists.every(list => list.records.length === 0))
})

test('a list over 40 words is split into the fewest parts of at most 40, from the easiest words to type to the hardest', () => {
  // The lists of v0.75.0 are split into at least three levels.
  const { initialLists } = require('../src/plugins/packs/index.ts')
  assert.ok(initialLists.every(list => list.words.length <= 40), initialLists.find(list => list.words.length > 40)?.name)
  // A symbol or a Japanese character counts as two letters. The first word introduces the list, so it opens 初級.
  const score = word => [...word.input.toLowerCase()].reduce((sum, c) => sum + (/[a-z0-9 ]/.test(c) ? 1 : 2), 0)
  const labels = { 2: ['初級', '上級'], 3: ['初級', '中級', '上級'], 4: ['初級', '中級1', '中級2', '上級'], 5: ['初級1', '初級2', '中級', '上級1', '上級2'] }
  const countries = require('../src/plugins/packs/countries.json')
  const grouped = [...new Set(initialLists.map(list => source(list.id)))]
    .map(id => initialLists.filter(list => source(list.id) === id)).filter(group => group.length > 1)
  assert.equal(grouped.length, 25)
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
  assert.deepEqual(countries.map(list => list.name), ['初級1', '初級2', '中級', '上級1', '上級2'].map(label => `国名：中国語・国連加盟国（${label}）`))
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
      assert.equal(word.display, word.input)
      // Go, Java, Kotlin, PostgreSQL, Prisma, Jest and Playwright examples hold Japanese strings and comments.
      assert.match(['go-syntax', 'java-syntax', 'kotlin-syntax', 'postgresql-syntax', 'prisma-syntax', 'jest-syntax', 'playwright-syntax', ...leveled].includes(source(list.id)) || japanese.includes(word.input) ? word.input.replace(/[^\x20-\x7e]/g, 'x') : word.input,
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

test('migrations 0009 to 0017 add the command lists to saved workspaces', () => {
  const fs = require('node:fs')
  const added = ['0009_seed_command_lists', '0010_seed_arch_linux_list', '0011_seed_vim_list', '0012_seed_go_syntax_list', '0013_seed_java_syntax_list', '0014_seed_kotlin_syntax_list', '0015_seed_lowercase_country_list', '0016_seed_postgresql_syntax_list', '0017_seed_test_framework_lists'].flatMap(name => {
    const sql = fs.readFileSync(require.resolve(`../prisma/migrations/${name}/migration.sql`), 'utf8')
    const literal = sql.match(/jsonb_array_elements\('(.*)'::jsonb\)/)[1].replaceAll("''", "'")
    return decodeLists(JSON.stringify({ version: 1, lists: JSON.parse(literal) }))
  })
  assert.deepEqual(added.map(list => list.id), sources.filter(id => !leveled.includes(id)))
  assert.ok(added.every(list => list.records.length === 0))
})

test('migration 0019 adds the lists of v0.75.0 to saved workspaces', () => {
  const fs = require('node:fs')
  const sql = fs.readFileSync(require.resolve('../prisma/migrations/0019_seed_framework_and_sql_lists/migration.sql'), 'utf8')
  const literal = sql.match(/jsonb_array_elements\('(.*)'::jsonb\)/)[1].replaceAll("''", "'")
  assert.deepEqual(decodeLists(JSON.stringify({ version: 1, lists: JSON.parse(literal) })), commands.filter(list => leveled.includes(source(list.id))))
})

test('migration 0020 adds the lists of 0019 again, up to 150 lists, where 0019 added none of them', () => {
  const fs = require('node:fs')
  const read = name => fs.readFileSync(require.resolve(`../prisma/migrations/${name}/migration.sql`), 'utf8')
  const pack = sql => sql.match(/jsonb_array_elements\('(.*)'::jsonb\)/)[1]
  const sql = read('0020_seed_framework_and_sql_lists_again')
  assert.equal(pack(sql), pack(read('0019_seed_framework_and_sql_lists')))
  assert.match(sql, /saved->>'id' = added\.list->>'id'/)
  assert.match(sql, /jsonb_array_length\(missing\.lists\) <= 150\n/)
  assert.equal(require('../src/core/listOverview.ts').MAX_LISTS, 150)
})

test('migration 0018 puts the parts of each split list in its place in saved workspaces', () => {
  const fs = require('node:fs')
  const sql = fs.readFileSync(require.resolve('../prisma/migrations/0018_split_long_initial_lists/migration.sql'), 'utf8')
  const pack = JSON.parse(sql.match(/jsonb_array_elements\('(.*)'::jsonb\)/)[1].replaceAll("''", "'"))
  const lists = [...require('../src/plugins/packs/countries.json'), ...commands]
  const split = [...new Set(lists.map(list => source(list.id)))].filter(id => !leveled.includes(id) && lists.filter(list => source(list.id) === id).length > 1)
  assert.deepEqual(pack.map(item => item.id), split)
  for (const item of pack) {
    assert.match(item.words, /^[0-9a-f]{32}$/)
    assert.deepEqual(item.parts, lists.filter(list => source(list.id) === item.id))
  }
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
  const countries = require('../src/plugins/packs/countries.json')
  const lower = words('un-member-states-chinese-193-lowercase')
  assert.deepEqual(lower, countries.flatMap(list => list.words).map(word => ({ ...word, input: word.input.toLowerCase() })))
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
