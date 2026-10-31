# 公式の単語リストの出典と検証

国名とコマンド・構文のリストの元データ、作り方、確かめ方です。リストの追加・削除の手順は [README](../README.md) の「関連リポジトリ」を見てください。

## 国名：中国語・国連加盟193か国

国名：中国語・国連加盟193か国を初期リストとDB seedに追加しています。表示は中国語、入力は声調記号なしのピンイン（例: 阿尔巴尼亚 → Aerbaniya）、補足はピンイン / 日本語です。提供ZIPの作成元データを保持し、既存リスト・練習記録を上書きしません。

## 国名データの出典・検証

[提供されたZIP](https://chatgpt.com/library/share/libfile_e75c8143a78c8191804af85bfd9d46a9?account_id=personal)と同じファイルの生成データ193行を利用しています。中国語名・拼音・日本語名は元資料の表記を維持しています。入力する文字は拼音から声調記号・隔音記号（'）・括弧を除いたアルファベットで、üはピンイン入力と同じvで入力します（例: 菲律宾 → Feilvbin）。`tests/countries.test.cjs` で元データ（入力を中国語名に戻し、中国語名の順に並べた状態。v0.74.0 から初級〜上級の5リストに分けたため）とのSHA-256一致、193件の重複なし、入力が拼音から作られていることを検証します。

入力を小文字にした「国名：中国語・国連加盟193か国（小文字）」（v0.69.0 から。v0.74.0 から「国名：中国語・国連加盟国（小文字・初級1）」〜「（小文字・上級2）」の5リスト）も初期リストにあります。表示・補足は同じで、入力は上のリストの拼音を小文字にしたものです。空白は残します（例: 安提瓜和巴布达 → `antigua he babuda`）。`src/plugins/packs/commands.json` の最後のリストで、保存済みのアカウントにはマイグレーション `0015_seed_lowercase_country_list` が追加します（コマンドのリストと同じ規則）。

## コマンドの単語リスト（Linux・Vercel CLI・gcloud・AWS CLI・macOS・Arch Linux・Vim・Go・Java・Kotlin・PostgreSQL・Prisma・Jest・Playwright）

`src/plugins/packs/commands.json` の18種類（1,779語）のうち、Linuxの5リスト（611語）は、提供されたLinuxコマンド表のCSV（学習用フラット一覧、64表・659行。SHA-256 `17ce06e70c8113a84b850034cd86100633a660b3ce2638c72fa2d0429273864f`）から作っています。

| リスト | 元の表 | 語数 |
|---|---|---|
| Linuxコマンド：基本 | 第1編のコマンド・シェル記法・開発での実践例（表01・03・05・09・11・13・15〜18） | 118 |
| Linuxコマンド：オプション | よく使うオプション、tar・sysctl・ulimitのオプション、共通オプション、シェルの重要なオプション（表02・04・06・10・12・14・19・22・24・27・29・54・58・59） | 146 |
| Linuxコマンド：応用 | 第2編のコマンド（ストレージ・ハードウェア・ネットワーク・systemd・デバッグ・Docker・DBなど。表20・21・23・25・26・28・30〜35） | 131 |
| Linux：シェルとBash | 特殊な記法・リダイレクト・シグナル関連コマンド・特殊変数・展開・条件式・スクリプト関連（表41・45・47〜51） | 76 |
| Linux：システムの仕組み | ディレクトリ構造・/proc・/sys・/dev・FD・シグナル・IPC・inode・リソース制限・Namespace・障害調査（表38〜40・42〜44・46・52・53・55・57・60〜63） | 140 |

表示と入力は同じ文字列（使用例があれば使用例、なければ項目そのもの。オプションは「コマンド オプション」）、補足は名前の由来と用途です（例: `ls -la` → 「ls（List）：ファイル・フォルダの一覧表示」）。同じリストで入力が重なる行は最初の1つだけを残します。比較表・練習チェックリスト・chmodの計算表（表07・08・36・37・56・64）は入力する語がないため含めません。
残りの13リストは、提供されたコマンド一覧のCSVから作っています。

| リスト | 元のCSV | 語数 |
|---|---|---|
| Vercel CLIコマンド | `vercel_cli_commands.csv`（33行、確認日2026-10-23。SHA-256 `d831e49a3fe6cfafdee92355af8a781205eb844ada688ec18d43ad221c937e78`） | 34 |
| Google Cloud CLI（gcloud）コマンド | `gcloud_commands.csv`（36行。SHA-256 `5889d3e150e73c15fd107f747ea9c73e34e6e07412631f36672cbcd9086dc399`） | 35 |
| AWS CLIコマンド | `aws_cli_commands.csv`（46行。SHA-256 `4b70f0a0b89397c3bbbb87fc43cd2f602f60797005756314608bbd77f1571c12`） | 46 |
| macOSターミナル（zsh）コマンド | `macos_zsh_commands.csv`（98行。SHA-256 `8e9ac51cac67e454bf07805e75019aeb72ba666f819f4a09cd1c45a877f42b43`） | 90 |
| Arch Linuxコマンド | `arch_linux_commands.csv`（97行。SHA-256 `437028d4a3fb392819a40dfbbebbe263d3e139f99a4cf2cc66410897cb8cc671`） | 96 |
| Vimコマンド | `vim_commands.csv`（127行。SHA-256 `85a4dc82701ca912aebed8716becaed98a8cbd16ab2e34082d4f8717ce932fe7`） | 112 |
| Go構文 | `go_syntax.csv`（108行。SHA-256 `913b331eebbaa5c95908305bff0a640e2feed5ba068d160e8a5be5159257f8a2`） | 109 |
| Java構文 | `java_syntax.csv`（138行。SHA-256 `fe632c5f280b54550a2b0f550f1b0c4f9a8656972832a4cbb0ed08ce5933414b`） | 130 |
| Kotlin構文 | `kotlin_syntax.csv`（144行。SHA-256 `a414e920c594b709c65a9aafd834581513b2e21eb63c67c418214590cc14d72d`） | 163 |
| PostgreSQL構文 | `postgresql_syntax.csv`（152行。SHA-256 `7d114285ec432c16cd7494677f5a78c68bb1e6177ee8464a235ff36660b1a067`） | 152 |
| Prisma構文 | `prisma_syntax.csv`（63行。SHA-256 `18348391c8639f5050ec8797549ff41322aba83b8fff5461b0b5affa13026c86`） | 64 |
| Jest構文 | `jest_syntax.csv`（65行。SHA-256 `2e7c6bb5af7ffd52721d8858f8d03230fa0eaf27a61567c9131049611290af3d`） | 67 |
| Playwright構文 | `playwright_syntax.csv`（66行。SHA-256 `1d0b10a579cdf8c38bccfaae43ad4c045d181b1e139dfc2550fff6a09a63acf0`） | 70 |

入力はコマンド例（`<URL>`・`PROJECT_ID` などの置き換える部分もそのまま）、補足は「用途：できること」に備考を括弧で添えたものです（例: `vercel deploy --prod` → 「本番公開：本番環境にデプロイする」）。1行に2つあるコマンド（`vercel project pause` / `vercel project resume`）は2語に分け、2行にある同じコマンド（`gcloud compute`）は補足を「 / 」でつないで1語にします。AWS CLIの補足は「サービス・機能：できること」に主なオプション・補足を添えます。

macOS（zsh）は実行例を入力し、補足は「コマンド・記号：用途」に注意点を添えます（実行例と同じときは用途だけ）。キー操作の8行（Tab・↑ / ↓・Control + C など）は押すキーで入力する文字ではないため含めません。`open .` は「.」と「open .」の2行の補足をつなぎ、`名前=値` の行の注意点（表計算ソフトのエラー表示 `#NAME?`）は除きます。`say "こんにちは"` など4語は日本語を含むため、IMEで入力します。

Arch Linuxも同じ規則で作ります。`sudo pacman -Syu` は「パッケージ管理」と「sudo」の2行の補足をつないで1語にします。`git clone https://aur.archlinux.org/パッケージ名.git` と `systemctl --user status 名前` は実行例に日本語の置き換え部分を含むため、IMEで入力します。

Vimは「コマンド・操作」を入力し、補足は用途に注意点を添えます（「同上」は前の行の注意点に置き換えます）。押すキーの15行（Esc・Ctrl + …・`v → 移動`・`Ctrl + w → w` など）は入力する文字ではないため含めません。「選択中に y」などは `y` を入力し、補足の先頭に「ビジュアルモードで選択中：」を付けます。置き換える部分を含む行のうち、注意点に例があるもの（`:e パス` → `:e ./memo.txt`、`r文字` → `ra`、`:help コマンド` → `:help ciw`）は例を入力し、残りの7語（`:w 名前`・`/文字列` など）は日本語の部分をIMEで入力します。

Go構文はコード例を入力し、補足は「構文：用途」に注意点を添えます。入力欄は1行なので、複数行のコード例は、Goが改行をセミコロンとして読むところ（識別子・リテラル・`)`・`]`・`}`・`++` などで終わる行）を `; `、それ以外を空白にして1行にします。`}` や `)` の前のセミコロンは省きます（例: `switch role { case "admin": fmt.Println("管理者"); case ...; default: fmt.Println("不明") }`）。シェルのコマンドの `gofmt -w main.go` 以外の108語は、gofmtで構文が正しいことを確かめています。構文の列と注意点にある表計算ソフトのエラー表示 `#NAME?` は、構文を `== / !=` に置き換え、注意点からは除きます。文字列やコメントの日本語はIMEで入力します。

Java構文も同じくコード例を1行にします。Javaは改行に意味がないので行を空白でつなぎ、複数行の例の中の `//` コメントは、つないだ後の行まで消さないよう `/* */` に置き換えます。ターミナルのコマンドの `java -version` 以外の129語は、javac（Java 21）の構文解析で正しいことを確かめています（コンストラクターは同名のクラスの中として）。`#NAME?` になっていた構文は `=` と `== / !=` に、同じコード例が2行にあるもの（`int age = 20;` など）は補足をつないで1語にします。

Kotlin構文も、Goと同じく改行が文の区切りになるため、文が終わる行の後ろを `; `、続きの行（`.filter`・`get()`・`set(...)`・`catch` など）や `}`・`)` の前を空白でつないで1行にします（例: `val label = when (role) { "admin" -> "管理者"; ...; else -> "不明" }`）。`.` で始まる続きの行は空白も入れずにつなぎます。raw文字列の例は改行を空白にします（`val text = """1行目 2行目"""`）。Kotlinコンパイラー（2.0.21）の構文解析で、`when` の中でだけ使う `else -> "不明"` 以外の162語が正しいことを確かめています。`#NAME?` になっていた構文は `=`・`==`・`===` に置き換えます。

PostgreSQL構文もSQL例を入力し、補足は「構文：用途」に注意点を添えます。SQLは改行に意味がないので行を空白でつなぎ（`(` の後ろと `)` の前の空白は詰めます）、`BEGIN; UPDATE ...; COMMIT;` のような複数の文は `;` で区切ったまま1行に並べます。`-- 1行コメント` は、つないだ後の行まで消さないよう `/* 1行コメント */` に置き換えます。152語すべてを PostgreSQL の構文解析器（pglast 8.7）で、構文が正しいことを確かめています（表や列があるかは確かめません）。`#NAME?` になっていた構文（`age <> 20` の比較）は「比較演算子」に置き換え、注意点からは除きます。文字列やコメントの日本語はIMEで入力します。

Prisma構文・Jest構文・Playwright構文もコード例を入力し、補足は「構文・API：用途」に注意点を添えます。TypeScript（JavaScript）のコード例は、Javaと同じく行を空白でつなぎ、`(`・`[` の後ろと `)`・`]` の前は空白を入れず、その前の行末のカンマも省きます（例: `await prisma.$transaction([prisma.user.update(...), prisma.post.updateMany(...)]);`）。`}` の前のカンマも省きます。複数行の例の中の `//` コメントは `/* */` に置き換えます。TypeScript（6.0）の構文解析で、Prismaの40語、Jestの62語、Playwrightの61語が正しいことを確かめています（`webServer: { ... }` は設定の一部として）。`npx` で始まるターミナルのコマンドは、1行に1つずつ別の語にします（`npx prisma format` と `npx prisma validate` など）。Prismaのスキーマ（`model Note { id Int @id @default(autoincrement()) body String }` など16語）も同じく1行にし、桁をそろえる空白は1つにします。スキーマは改行がフィールドの区切りなので、1行にした形はPrismaのスキーマとしては正しくありません。元の複数行の形は `prisma validate`（Prisma 7）で確かめています。

`tests/commands.test.cjs` で、18リストの読み込み、語数、入力が前後に空白のないASCII（Go・Java・Kotlin・PostgreSQL・Prisma・Jest・Playwright構文と、日本語を含む13語を除く）で表示と一致すること、リスト内で入力が重複しないことを確かめます。

初期リストなので、まだ一度も保存していないアカウントとブラウザーには最初から表示されます。v0.63.0 から、すでに保存しているアカウントにも、マイグレーション `0009_seed_command_lists`（`npm run db:migrate`。本番ではデプロイ時に実行）が9リストを、v0.64.0 から `0010_seed_arch_linux_list` がArch Linuxのリストを、v0.65.0 から `0011_seed_vim_list` がVimのリストを、v0.66.0 から `0012_seed_go_syntax_list` がGo構文のリストを、v0.67.0 から `0013_seed_java_syntax_list` がJava構文のリストを、v0.68.0 から `0014_seed_kotlin_syntax_list` がKotlin構文のリストを、v0.71.0 から `0016_seed_postgresql_syntax_list` がPostgreSQL構文のリストを、v0.72.0 から `0017_seed_test_framework_lists` がPrisma・Jest・Playwright構文の3リストを、v0.75.0 から `0019_seed_framework_and_sql_lists` がTypeScript・Hono・PHP・Rails・Express・Oracle PL/SQL・SQL Server T-SQLの21リストを追加します。小文字の国名リストも、同じ規則で `0015_seed_lowercase_country_list` が追加します。`scripts/seed.cjs` と同じく、同じIDまたは同じ名前のリストがある場合はそのリストを追加せず、ほかのリストと練習記録はそのまま残します。追加すると100リストか保存できる大きさ（`MaxListsBytes`）を超えるアカウントには追加しません。マイグレーションは1回だけ実行されるため、その後に削除したリストは戻りません。v0.87.1 から、これらのマイグレーション（0009〜0022）は `0023_seed_initial_lists` の1ファイルに元の名前の手順としてまとめてあり、適用済みの DB では実行しません。v0.99.4 で `0023_seed_initial_lists` と `npm run db:seed` は削除しました。このブラウザーに保存している場合（ログインしていない場合）はマイグレーションの対象外です。

上の表の語数は元のリストのものです。v0.74.0 から、40語を超えるリストは初級・中級・上級などに分けて `commands.json`・`countries.json` に入れています（分け方は v0.74.0 の説明、確かめ方は `tests/commands.test.cjs`）。保存済みのアカウントでは `0018_split_long_initial_lists` が分けたリストに置き換えます。
