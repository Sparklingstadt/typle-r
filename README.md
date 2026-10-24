# Typle


自分の単語リストで練習できるタイピングアプリです。

## v0.82.0 — 単語リストのカテゴリ・タグを、使っているものから選ぶか新しく作成して選ぶようにしました

単語リストの作成・編集画面のカテゴリとタグを、shadcn/ui のコンボボックス（Popover と Command）にしました。開くと、ほかのリストで使っているカテゴリ・タグが並び、入力で絞り込めます。一覧に無い名前を入力すると「「〜」を作成」が出て、作成するとそのまま選ばれます。

- カテゴリは1つです。選び直すと入れ替わり、「カテゴリを外す」で外せます。
- タグは複数選べます。選んだタグにはチェックが付き、もう一度選ぶと外れます。カンマで区切って入力すると、まとめて作成できます（20個まで）。付けたタグは下に並び、×で外せます。
- これまでの「入力途中のタグも保存する」動きは無くなりました。作成したタグだけを保存します。
- 依存パッケージに `cmdk`（shadcn/ui の Command が使う）を追加しました。

## v0.81.0 — 練習中に入力欄から離れると、計測を一時停止するようにしました

練習画面（Web）で、練習中に入力欄からフォーカスが外れると（別のウィンドウやタブへの切り替え、画面の別の場所のクリックなど）、経過時間と速度の計測を止めます。「クリックまたは任意のキーで再開」で入力欄に戻ると、止めたところから計測を再開します。正確率とミスは入力したときにしか変わらないため、離れている間はそのままです。保存する記録の時間にも、一時停止していた時間は含みません。

- iPad・Mac・Android・Windows のアプリは変えていません。

## v0.80.0 — 単語リストを選ぶと、すべての単語を最初から表示するようにしました

練習画面（Web）の「すべての単語を表示」を、最初に開いたときと単語リストを切り替えたときに開いた状態にしました。選んだリストにどんな単語があるかを、練習を始める前に確かめられます。閉じたいときはこれまでどおりボタンで閉じられ、次に別のリストを選ぶとまた開きます。

## v0.79.0 — 難易度で分けた単語リストを1つにまとめ、選ぶときに難易度を選べるようにしました

初級・中級・上級などに分けた初期リストを、一覧と練習画面では1つのリストとして表示し、選ぶときに難易度を選ぶようにしました。たとえば「Linuxコマンド」は、「基本」「オプション」「応用」を選んでから、初級・中級・上級を選びます。85件の初期リストは、23のまとまりと4つのリストとして並びます。

- 練習画面：まとまりを選ぶと難易度のボタンが開き、順に選ぶとそのリストで練習を始めます。練習中のリストのまとまりは開いた状態で、選んでいる難易度を表示します。並び順は最近練習した順のままで、まとまりはその中で最後に練習したリストの位置に入ります。難易度の選択肢は保存順（初級→上級）です。
- 単語リストの画面：まとまりを1行で表示し（難易度の数・合計の語数・練習の状況）、開くと今までどおり各リストを編集・書き出し・複製・削除できます。検索や絞り込みの間は、当たったリストのまとまりを開いて表示します。「練習」は最後に練習したリスト（なければ最初のリスト）を開きます。
- 保存は今までどおりの別々のリストで、記録とベスト記録もリストごとです。リストに任意の `group`（まとまりの名前）と `levels`（難易度。広い方から順）を持ちます。編集しても変わらず、複製したリストはまとまりに入りません。上限は `group` 200文字、`levels` 1つ50文字・5段までです。
- マイグレーション `0022_group_initial_lists`：保存済みのアカウントの初期リスト（id が同じもの）に `group` と `levels` を付けます。すでにどちらかがあるリストはそのまま、保存できる大きさ（896KB）を超えるアカウントは変えません。ブラウザー保存（ログインなし）の既存のリストには付きません（新しく始めたときの初期リストには付いています）。
- 以前の Web 画面と Go のバックエンドは知らない項目として残すので、古い画面で保存しても消えません。Go の API は `group`・`levels` を返しません。
- iPad/Mac・Android・Windows：core が `group`・`levels` を読み書きし、保存や編集で消さないようにしました。画面でのまとめ表示はまだありません。

## v0.78.0 — 単語リストにカテゴリとタグを付けられるようにしました

単語リストに「カテゴリ」（「プログラミング」「語学」など大まかな分類を1つ）と「タグ」（「Kotlin」「PostgreSQL」など具体的な内容を複数）を付け、一覧で見分けたり絞り込んだりできるようにしました。

- 作成・編集画面の「単語リスト名」の下に、カテゴリとタグの欄を追加しました。使っているカテゴリ・タグを候補に出します。タグは Enter かカンマで追加し、×で外します。入力途中のタグも保存されます。
- 単語リストの画面：各リストの名前の横にカテゴリとタグを表示します。「すべてのカテゴリ」（1つ選ぶ・カテゴリなし）と「すべてのタグ」（複数選ぶと、そのすべてを持つリスト）で絞り込めます。検索もカテゴリ・タグから探します。
- 練習画面：リストの選択肢（右側と「単語リストを選ぶ」）にカテゴリとタグを表示し、カテゴリで絞り込めます。名前での絞り込みもカテゴリ・タグから探します。
- 初期リスト85件にカテゴリとタグを付けました（サンプルと国名は「語学」、ほかは「プログラミング」。タグは Linux・シェル・Go・Kotlin・PostgreSQL・Playwright など）。
- 保存形式：リストに `category`（文字列）と `tags`（文字列の配列）を任意で持ちます。ないときは保存しないため、付けていないリストは今までと同じ形です。前後の空白を除き、大文字小文字だけ違う同じタグはまとめます。上限はカテゴリ50文字、タグ1つ50文字・20個までです。以前の Web 画面と Go のバックエンドは知らない項目を残すため、古い画面で保存しても消えません。
- マイグレーション `0021_label_initial_lists`：保存済みのアカウントの初期リスト（id が同じもの）に、カテゴリとタグを付けます。すでにカテゴリかタグがあるリストはそのまま、保存できる大きさ（896KB）を超えるアカウントは変えません。ブラウザー保存（ログインなし）のリストには付けません（新しく始めたときの初期リストには付いています）。
- Go の API：リストの一覧・詳細に `category`（ないときは `null`）と `tags` を返し、`GET /api/v1/lists` は `category`・`tag` で絞り込めます。作成（`POST`）・変更（`PATCH`）で `category`・`tags` を指定でき、複製はそれも写します（[API（Go）](docs/api.md)）。
- iPad/Mac・Android・Windows：core が `category`・`tags` を読み書きするようにし、保存や編集・複製で消さないようにしました（検索もカテゴリ・タグから探します）。画面での表示・編集はまだありません。
- CSV・TSV の取り込み・書き出しは単語だけを扱うため変わりません。カテゴリとタグは CSV に入りません。
- Windows の core のテストが v0.76.0 で上限を150件にした後も100件を期待していたので直しました。
## v0.77.0 — 長い単語は行数に応じて文字を小さくしました

練習画面（Web）で、表示する単語がいつもの大きさで3行以上に折り返すときは、行が増えるごとに文字を一段ずつ小さくします。SQL文のような長い単語でも入力欄が画面の下に押し出されにくくなります。

| いつもの大きさでの行数 | スマートフォン | 640px以上 |
|---|---|---|
| 2行まで（変わりません。25文字以上の例） | 20px | 26px |
| 3行 | 18px | 22px |
| 4行 | 17px | 20px |
| 5行 | 16px | 18px |
| 6行以上 | 15px | 16px |

- 行数は画面幅に合わせて数え直します。小さくした後の行数ではなく、いつもの大きさで隠して並べた写しの行数で決めるため、大きさが行き来しません。
- iPad・Mac・Android・Windows のアプリは変えていません。

## v0.76.0 — 保存できる単語リストを150件にしました

初期リストが85件に増え、新しいアカウントで作れるリストが15件しかなかったため、保存できる単語リストの上限を100件から150件にしました（Web・Goのバックエンド・iPad/Mac・Android・Windows）。保存できる大きさの上限（`MaxListsBytes`、896KB）は変わりません。初期リスト85件は約418KBです。

- 単語リストの画面の件数表示は「85 / 150」のようになり、使い方の説明も150件にしました（6言語）。
- マイグレーション `0020_seed_framework_and_sql_lists_again`：v0.75.0 の `0019_seed_framework_and_sql_lists` は、追加すると100件を超えるアカウントには何も追加していませんでした。そうしたアカウント（v0.75.0 の21リストを1つも持たないアカウント）に、150件までの範囲で21リストを改めて追加します。0019 で追加された後に一部を削除したアカウントには戻しません。

## v0.75.0 — TypeScript・Hono・PHP・Rails・Express・Oracle PL/SQL・SQL Server T-SQL の単語リストを追加しました

提供された7つのCSVから単語リストを作り、それぞれ初級・中級・上級の3つに分けて初期リストに加えました（21リスト、各11〜18語）。初期リストは64件から85件になります。

| リスト | 元のCSV | 語数 | 分けた後 |
|---|---|---|---|
| TypeScript構文 | `typescript7_syntax.csv`（53行。SHA-256 `20a87a01b79427fc49674fc58cec57fe22bea0f0a2cacb5ad2d6b07052a38c86`） | 54 | 18・18・18 |
| Honoメソッド | `hono_methods.csv`（34行。SHA-256 `71e6433f2d6f0a277c033f6c6bf96d333965043b58a76880bd4e37f08d468462`） | 36 | 12・12・12 |
| PHP構文 | `php_syntax.csv`（39行。SHA-256 `728784d6b39eb9b91c9fa770877a5248579d2263a6160fe9db6ec9e1765d7a71`） | 41 | 14・14・13 |
| Railsメソッド | `rails_methods.csv`（39行。SHA-256 `758e2538aec1413f0ac26afe93d135047c1672113712418bdc69491174048c7e`） | 44 | 15・15・14 |
| Expressメソッド | `express_methods.csv`（33行。SHA-256 `cc60342c358ef0017b1183b13008ce34cf11d501fe6c998e31bcc82a64918308`） | 35 | 12・12・11 |
| Oracle PL/SQL構文 | `oracle_plsql_syntax.csv`（36行。SHA-256 `6d5c3da966dbfdfea3593ddb7000c4422a9b3a32a82c0ae9e257cae96b69f20b`） | 37 | 13・12・12 |
| SQL Server T-SQL構文 | `sql_server_tsql_syntax.csv`（43行。SHA-256 `5167a4332cda94395ad0933d9a37c07df7c8afa3f808c3206e345f2e37c01818`） | 45 | 15・15・15 |

- 分け方：v0.74.0 と同じく、入力の文字数（記号と日本語は2文字）で打ちやすい順に並べ、語数をそろえて分けます。リストの最初の語（前提の説明）は初級の最初に残し、各リストの中は元の順のままです。どのリストも40語以下ですが、練習しやすいよう3つに分けます。
- 補足は「構文・メソッド：用途」に注意点を括弧で添えます。コード例は1行にして入力します。
  - TypeScript・Hono・Express：Prisma・Jest・Playwright と同じつなぎ方です（`(`・`[` の後ろと `)`・`]` の前は空白なし、複数行の中の `//` コメントは `/* */`）。TypeScript の構文解析で、`npm` のコマンドと tsconfig（JSONとして確認）以外のすべてが正しいことを確かめています。
  - PHP：行を空白でつなぎます。`php -l`（PHP 8.3）で、コマンド以外の38語が正しいことを確かめています。
  - Rails：Ruby は改行が文の区切りなので `; ` でつなぎます（`User.transaction do; user = ...; end`）。ERB のテンプレートは空白でつなぎます。「# 別の…例:」の後のコメントの例は、コメントを外して別の語にします（`head :no_content`、`Post.where(published: false).delete_all`）。`ruby -c`（Ruby 3.3）で、コマンドと Rails の ERB にだけある `<%= form_with ... do |f| %>` 以外の39語が正しいことを確かめています。
  - Oracle PL/SQL：行を空白でつなぎます。SQL*Plus の実行区切りの `/` は入力せず、そこで別の語に分けます（パッケージの宣言と本体）。構文解析器で確かめられるものがないため、PL/SQL の構文は確かめていません。
  - SQL Server T-SQL：行を空白でつなぎ、`(` の後ろと `)` の前の空白は詰めます。`GO` の行はクライアントの区切りなので1語にし、前後を別の語にします。複数行の中の `--` コメントは `/* */` にします。sqlglot（tsql）で40語の構文を確かめています（`GO`・`OUTPUT` 付きの `DELETE`・`WHILE`・`TRY CATCH`・`SET STATISTICS` の5語は sqlglot が読めないため対象外）。
  - 1行に1つずつのコマンド（`npm`・`npx`・`php`・`bin/rails`）は、1つずつ別の語にします。
- 保存済みのアカウント：マイグレーション `0019_seed_framework_and_sql_lists` が、0017 と同じ規則で21リストを追加します（同じIDか同じ名前のリストがあればそのリストは追加せず、100リストか保存できる大きさを超えるアカウントには追加しません）。
- 初期リストが85件になったため、新しいアカウントで作れるリストは残り15件です（上限は100件）。

## v0.74.0 — 40語を超える初期リストを初級・中級・上級に分けました

1つのリストが最大193語あり、1回の練習が長すぎたため、40語を超える18リストを40語以下に分けました。初期リストは22件から64件になります（分けたリストは23〜40語）。

- 分け方：40語以下になる最少の数に、語数をそろえて分けます。打ちやすい語から順に、2つなら（初級）（上級）、3つなら（初級）（中級）（上級）、4つなら（初級）（中級1）（中級2）（上級）、5つなら（初級1）（初級2）（中級）（上級1）（上級2）です（例：「Kotlin構文（初級1）」）。国名は「国名：中国語・国連加盟国（初級1）」「国名：中国語・国連加盟国（小文字・初級1）」のようにします。
- 難しさ：入力する文字数で比べ、記号と日本語の文字は2文字として数えます（大文字・小文字は区別しません）。リストの最初の語（`pwd` や `// Prisma ORM 7 / TypeScript / PostgreSQL` などの前提の説明）は、初級の最初に残します。各リストの中は元の順（話題のまとまり）のままです。
- 保存済みのアカウント：マイグレーション `0018_split_long_initial_lists` が、元のリストをその位置で分けたリストに置き換えます。練習記録があるリストや語を編集したリストは、記録と語をそのまま残し、その後ろに分けたリストを加えます。削除したリストは戻しません。同じIDか同じ名前のリストがあればそのリストは加えず、100リストか保存できる大きさを超えるアカウントは変えません。
- 40語以下の Vercel CLI（34語）・gcloud（35語）とサンプル2件はそのままです。Android・iPad・Mac・Windows の初期リストも同じです（`countries.json` は複数のリストの配列になりました）。

## v0.73.1 — Next.js を 16.4.2 に上げました（セキュリティ修正）

Next.js 16.4.0 に見つかった脆弱性を直すため、`next`・`@next/env`・`eslint-config-next` を 16.4.2 にしました。対象は次の3件です。

- 画像最適化 API で SVG を扱うときの、認証なしのリモートコード実行（GHSA-2464-fhr4-w9xw、critical）
- `use cache` の関数が型付き配列を返すときの、認証なしのリモートコード実行（GHSA-673q-mjm6-r5xr）
- App Router の Server Actions でのサービス拒否（GHSA-p3m5-59mp-jv5r）

アプリの動作は変わりません。`npm audit` には開発用の道具（ESLint・shadcn の CLI）が使う `braces` などの指摘が残っています。本番のアプリには含まれないため、今回は変えていません。

## v0.73.0 — 画面の改善（単語リストの選びやすさ・表示の整理）

実際に画面を操作して見つけた改善点（Figma の「Typle UI改善点」）を反映しました。

- 練習画面の単語リスト：検索欄を付け、一覧はカードの中でスクロールするようにしました（画面の高さに合わせ、最大 36rem）。最近練習したリストを上に並べます（練習したことのないリストは保存順）。リストを選び直すダイアログも同じ順です。
- 長いリスト名：練習画面とベスト記録の一覧で2行まで表示し、ホバーで全体を出します（「国名：中国語・国連加盟193か国（小文字）」を元のリストと見分けられます）。
- 練習画面の「次の単語」：長いコード例は枠の中で「…」を付けて省略します。
- ホーム：ログインしているときは、アカウントに保存され端末の間で同期されることを説明します（ゲスト向けの説明は出しません）。「以前のデータを移行」は、このブラウザーに v0.1.x のデータがあるときだけ表示します。説明の余分な空白も取りました。
- 保存先の表示：右上のトップバーの1か所にしました。トップバーが隠すスマートフォンの幅では、これまでどおり見出しの横に出します。
- 単語リストの各行の練習ボタンに「練習」の文字を付けました。ホームの「3 単語」は、ほかの画面と同じ「3語」にしました。
- 初期リストのサンプル「Test 1」（hoge・foo・bar）と「Test 2」（one・two・three）を、「サンプル：英単語（果物）」（apple・banana・cherry・grape・lemon）と「サンプル：英単語（動物）」（cat・dog・bird・horse・rabbit）にしました。補足に日本語の意味が入ります。`npm run db:seed` も同じ2リストを同じIDで追加します。すでに保存したアカウントとブラウザーのリストは変わりません。

## v0.72.1 — 練習画面で入力する単語が画面の外に出る問題を直しました

練習画面のカードが右の単語リストの高さまで伸び、入力する単語がその縦の中央に置かれていました。単語リストが増えると（初期リストは22件）、開いたときに入力欄へスクロールした分だけ単語が画面の上に隠れていました（1440×900 で約80px、1280×720 で約260px 上）。カードを内容の高さにし、単語を入力欄のすぐ上に表示します。練習完了の画面の下の大きな空白もなくなります。E2E（`tests/e2e/play.spec.ts`）で、22リストのときに単語と入力欄がどちらも画面に収まることを確かめます。

## v0.70.0 — Android・iPad・Mac・Windows・Kotlin のワークフローを削除しました

GitHub Actions の利用時間を減らすため、`Android app`・`iPad app`・`Mac app`・`Windows app`・`Kotlin backend` の5つのワークフロー（`.github/workflows/android.yml`・`ios.yml`・`macos.yml`・`windows.yml`・`kotlin-server.yml`）を削除しました。macOS と Windows のランナーは利用時間が多く数えられ、`src/plugins/packs/` を変える PR でも4つが動いていました。残るのは Web 版の検証・リリース・デプロイ（`ci.yml`）だけで、その内容は変わりません。

各アプリのビルド・テスト・スクリーンショットは手元で行います（手順は各 README）。アプリが持つ単語リストの写しと文言は、これまでどおり `npm test`（`tests/android.test.cjs`・`ios.test.cjs`・`macos.test.cjs`・`windows.test.cjs`）が確かめます。

## v0.61.1 — CSV・TSV の取り込みダイアログの説明を直しました

取り込みダイアログは「display は必須、input・annotation は省略できます」と案内していましたが、取り込みは `input` と `display` の列を両方必須にしています。6言語の説明を実際の動作（`input` と `display` は必須、`annotation` は省略できる）に合わせました。取り込みの動作は変わりません。

## v0.60.0 — macOS版（SwiftUI）を追加しました

`macos/` に Mac のネイティブアプリ（SwiftUI、macOS 14以上）を追加しました。Web版と同じ全ページ（ホーム・練習・練習記録・ベスト記録・単語リストと作成・編集・端末・一般）を Web版と同じ見た目で備え、Mac のキーボードで練習できます。データはこの Mac に保存するか、Web版・iPad版・Android版・Windows版と同じ GitHub ログインで、本番の Go のバックエンド（`/api/auth/*`・`/api/workspace`）のアカウントに保存します。GitHub Actions が作るアプリ（`typle-macos-app`）を手で入れるか、Xcode で `macos/` を開いて起動します。入れ方と範囲は [macos/README.md](macos/README.md) を参照してください。

- iPad 版（`ios/`）の SwiftUI のコードと共通の規則（`ios/TypleCore`）をそのまま使い、Mac で違うところ（練習欄の AppKit の入力欄、メニューバーとショートカット、CSV の保存、「この Mac」などの文言、色の切り替え）だけを `#if os(macOS)` と `macos/` に置きました。iPad 版の見た目と動きは変わりません。
- サーバーは `client=macos` のログインも受け付けるようになりました（Go のバックエンドと、手元用の Kotlin のバックエンド。下の「iPad と Mac と Android と Windows のログイン」）。Web版・iPad版・Android版・Windows版・`/api/v1` は変わりません。GitHub の OAuth App の設定と環境変数も変わりません。
- 新しいワークフロー `Mac app`（`.github/workflows/macos.yml`）が、`macos/` か `ios/` を変えた PR と手動の実行で、Mac 向けのビルド、各ページのスクリーンショット、配布用のアプリを作ります。リリース・デプロイ（`ci.yml`）の条件ではなく、本番のデプロイ物も変わりません（`.vercelignore` で `macos` を外しています）。

## v0.59.0 — Windows 11 版（WinUI 3）を追加しました

`windows/` に Windows 11 のネイティブアプリ（C#・WinUI 3・Windows App SDK、Windows 10 1809 以上で動きます）を追加しました。Web版と同じ全ページ（ホーム・練習・練習記録・ベスト記録・単語リストと作成・編集・端末・一般）を Web版と同じ見た目・判定・記録の規則で備えます。データはこのパソコンに保存するか、「一般」で「GitHub でログイン」を押して、Web版・iPad 版・Android 版と同じ本番の Go のバックエンド（`/api/auth/*`・`/api/workspace`）でアカウントに保存します。

- ログインは既定のブラウザーで開き、終わると `typle-r://login?code=…` で Typle に戻ります（Typle は起動のたびにこのアドレスをこの Windows ユーザーに登録します）。トークンは Windows のデータ保護（DPAPI）で暗号化して、このパソコンにだけ保存します（下の「iPad と Mac と Android と Windows のログイン」）。
- サーバーは `client=windows` も受け付けるようになりました（Go のバックエンドと、手元用の Kotlin のバックエンド）。流れは iPad・Android と同じで、Web版・iPad 版・Android 版・`/api/v1` は変わりません。GitHub の OAuth App の設定と環境変数も変わりません。
- GitHub Actions の新しいワークフロー `Windows app`（`.github/workflows/windows.yml`）が、`windows/` を変えた PR と手動の実行で、共通の規則（`windows/Typle.Core`）のテスト、アプリのビルド、各ページのスクリーンショットを行い、アプリを成果物 `typle-windows-x64` に残します。リリース・デプロイ（`ci.yml`）の条件ではなく、本番のデプロイ物も変わりません（`.vercelignore` で `windows` を外しています）。
- 入れ方と範囲は [windows/README.md](windows/README.md) にあります。

## v0.58.0 — Kotlin のバックエンドを手元で使えるようにしました

Go のバックエンド（`server/cmd/typle-web`：`/api/health`・`/api/workspace`・`/api/auth/*`）と同じ API を Kotlin（Ktor）で作り、`server-kotlin/` に置きました。`TYPLE_BACKEND=kotlin npm run dev`（`dev:local`・`dev:lan` も）で、Go の代わりにこちらを `next dev` と一緒に起動します。E2E も `TYPLE_BACKEND=kotlin npm run test:e2e` で Kotlin を相手に流せます。

- 手元の開発と CI だけで使い、**本番（Vercel）と既定は Go のまま**です。本番のデプロイ物は変わりません（`.vercelignore` で `server-kotlin` を外しています）。
- JDK 21 が必要です（Gradle 8.14 は Java 25 では動かないため、21 ちょうどです。`JAVA_HOME` で指定できます）。Go のときと同じ環境変数と DB を使い、同じ `AUTH_SECRET` なら Go と Kotlin を入れ替えてもログインしたまま同じデータを読み書きできます。
- 新しいワークフロー `Kotlin backend`（`.github/workflows/kotlin-server.yml`）が、PR と手動の実行で、Kotlin の単体テストと、バックエンドを Kotlin にした全 E2E を行います。リリース・デプロイ（`ci.yml`）の条件ではありません。
- 使い方と Go との対応は [server-kotlin/README.md](server-kotlin/README.md) にあります。

## v0.57.1 — iPad・Android のワークフローを main への push で動かさないようにしました

`.github/workflows/ios.yml`（macOS のランナー）と `.github/workflows/android.yml`（エミュレーター）は、アプリを変えた PR と手動の実行（workflow_dispatch）だけで動き、マージ後の main への push では同じビルドをもう一度行いません。GitHub Actions の利用時間を大きく使うためです。main への push の CI（`ci.yml` の policy・verify・release・deploy）は変わりません。

v0.57.0 は Actions の利用枠が上限に近づいて main の CI が起動せず、Release とデプロイが行われませんでした。v0.57.0 の変更（Android 版の GitHub ログイン）は、この v0.57.1 で一緒に公開します。

## v0.57.0 — Android 版も Web版と同じ Go のバックエンドを使うようにしました

Android タブレットのアプリ（`android/`）の「アカウント」の保存先を、自分で立てる API（`/api/v1`、`server/cmd/typle-api -writable`）と GitHub の個人用アクセストークンから、iPad 版（v0.56.0）と同じ、本番の Go の関数（`/api/auth/*`・`/api/workspace`）に切り替えました。「一般」で「GitHub でログイン」を押すと Web版と同じ GitHub ログインが開き、Web版と同じ単語リスト・記録・端末を読み書きします。サーバーを立てる必要も、GitHub のトークンを作る必要もなくなりました。

- アカウントでも記録の削除ができるようになりました（以前の Android の API 接続でも端末の追加・変更・削除はできましたが、記録の削除はできませんでした）。
- 別の画面で同時に保存されたとき（`409 conflict`）は、最新を読み直して同じ変更をやり直します（3回まで）。
- Android は Cookie ではなく、ログインの最後に受け取るトークンを `Authorization: Bearer` で送ります。トークンは Android Keystore の鍵で暗号化して保存します。ログインは Android アプリが作った PKCE の検証値を持つアプリにしか完了できません（下の「iPad と Mac と Android と Windows のログイン」）。
- サーバーの URL の初期値は本番の `https://typle-r-six.vercel.app` です。http は `localhost`・`127.0.0.1`・`10.0.2.2`・`*.local` だけで、エミュレーターから手元の `npm run dev` につなぐときは `http://10.0.2.2:<ポート>` です。
- 以前の「アカウント（API）」の設定とトークンは使わなくなり、更新後の初回起動で消して「このタブレット」に戻ります。タブレットに保存したデータは変わりません。
- サーバーは `client=android` も受け付けるようになりました。Web版・iPad 版・`/api/v1` は変わりません。GitHub の OAuth App の設定と環境変数も変わりません。

## v0.56.0 — iPadOS版が Web版と同じ Go のバックエンドを使うようにしました

iPad アプリ（`ios/`）の「アカウント」の保存先を、自分で立てる API（`/api/v1`、`server/cmd/typle-api -writable`）から、本番の Go の関数（`/api/auth/*`・`/api/workspace`）に切り替えました。「一般」で「GitHub でログイン」を押すと Web版と同じ GitHub ログインが開き、Web版と同じ単語リスト・記録・端末を読み書きします。サーバーを立てる必要も、GitHub のトークンを作る必要もなくなりました。

- アカウントでも、端末の追加・変更・削除と記録の削除ができるようになりました（`/api/v1` ではできませんでした）。
- 別の画面で同時に保存されたとき（`409 conflict`）は、最新を読み直して同じ変更をやり直します（3回まで）。
- iPad は Cookie ではなく、ログインの最後に受け取るトークンを `Authorization: Bearer` で送ります。ログインは iPad が作った PKCE の検証値を持つアプリにしか完了できません（下の「iPad と Mac と Android と Windows のログイン」）。
- 以前の「アカウント（API）」の設定とトークンは使わなくなり、更新後の初回起動で消して「この iPad」に戻ります。iPad に保存したデータは変わりません。
- Web版・`/api/v1`・Android 版は変わりません。GitHub の OAuth App の設定と環境変数も変わりません。

## v0.55.0 — アプリのバックエンドを Go にしました

GitHub ログインと `/api/workspace`（クラウド保存）を、Next.js（Auth.js・Prisma）から Go に移しました。画面の見た目・文言と保存データ（`typle_workspaces`）の形は変わりません。Next.js には API ルートと Auth.js（`next-auth`）がなくなり、Prisma はマイグレーション（`npm run db:migrate`）と `npm run db:seed` だけに使います。Vercel の本番では、リポジトリ直下の `api/*.go` が Go の関数として動きます（`/api/health`・`/api/workspace`・`/api/auth/*`）。外部向けの `/api/v1`（`server/cmd/typle-api`）はこれまでどおり本番に載せません。

- **一度ログインし直してください。** 切り替え前のログインは引き継がないため、v0.55.0 の公開後は全員が一度ログアウトした状態になります。もう一度 GitHub でログインすれば、アカウントに保存した単語リストと記録はそのまま表示されます（データはサーバーにあり、消えません）。ブラウザーに保存したデータにも影響はありません。
- GitHub の OAuth App の設定（Homepage URL・callback URL `<AUTH_URL>/api/auth/callback/github`）と環境変数は変わりません。`AUTH_URL` はオリジン（`https://example.com` の部分）だけを使います。
- 手元で開発するには Go 1.25 以上が必要です。`npm run dev`・`npm run dev:local`・`npm run dev:lan` は、Go のバックエンド（`server/cmd/typle-web`、`127.0.0.1:8081`）と `next dev` の2つを一緒に起動し、どちらかが止まるともう片方も止めます。詳しくは「Dockerでの仮運用」を参照してください。

## v0.46.0 — Androidタブレット版（Kotlin・Jetpack Compose）を追加しました

`android/` に Android タブレットのネイティブアプリ（Kotlin・Jetpack Compose、Android 8.0以上）を追加しました。iPad 版と同じ全ページ（ホーム・練習・練習記録・ベスト記録・単語リストと作成・編集・端末・一般）を Web版と同じ見た目で備え、タブレットを横向きにして外付けキーボードで練習できます。データはこのタブレットに保存するか、[API（Go）](docs/api.md)にGitHubのトークンでつないでアカウントに保存します。GitHub Actions が作る debug APK を手で入れて使います。入れ方と範囲は [android/README.md](android/README.md) を参照してください。Web版・API・iPad版は変わりません。

## v0.44.0 — iPadOS版の見た目をWeb版にそろえました

iPad アプリ（`ios/`）の画面を、Web版と同じ上部バー・サイドバー（狭い画面ではドロワー）・カード・色・文言に作り直し、ホームのダッシュボードと「一般」の表示言語の切り替えを加えました。単語リストの作成・編集は Web版と同じくページで行います。Web版とAPIは変わりません。

## v0.43.0 — iPadOS版（SwiftUI）を追加しました

`ios/` に iPad のネイティブアプリ（SwiftUI、iPadOS 17以上）を追加しました。Web版と同じ判定・記録・ベストの規則で、ハードウェアキーボードでもソフトウェアキーボードでも練習できます。データはこの iPad に保存するか、[API（Go）](docs/api.md)を `-writable` で起動したサーバーにGitHubのトークンでつないでアカウントに保存します。起動方法と範囲は [ios/README.md](ios/README.md) を参照してください。Web版とAPIは変わりません。

## v0.38.0 — GitHubログインとクラウド保存を戻しました

v0.36.0 で削除した GitHub ログイン（開発用ログインを含む）とアカウントのクラウド保存を、v0.35.2 と同じ動きで戻しました。ログインすると、以前アカウントに保存していた単語リストと記録がまた表示されます。共有リンク・APIトークン・Typle API（`/api/v1`）は戻していません。マイグレーション `0008_drop_shared_lists_and_api_tokens` で、使わなくなった `typle_shared_lists` と `typle_api_tokens` を削除しました。以前のリストに残る共有の項目（`shared`・`shareId`）は、読み込み時に捨てます。

- v0.36.0 の間にブラウザーへ保存したデータは、ブラウザーに残っています。有効なログインのCookieが残っていると自動でログインした状態になり、アカウントのデータが表示されます。ブラウザーのデータを見るにはログアウトしてください。
- `0008` を適用した後は、本番を v0.35.2 以前に戻さないでください。v0.35.2 以前のアプリは削除したテーブルを読むため、クラウド保存がすべて失敗します。切り戻すときは v0.36.0 までにしてください。

## ログインなしで利用

未ログインでも練習、単語リストの作成・編集・削除・並べ替え、CSV/TSV取り込み、CSV書き出し、記録・ベスト記録、端末管理が利用できます。データはこのブラウザーのLocalStorage（`typle-r:guest-workspace:v1`）に保存します。ブラウザーのデータ削除で失われ、別端末には同期されません。

GitHubログインは任意です。ログイン時は従来のアカウント専用クラウド保存に切り替わります。両方のデータは分離され、自動コピーしません。ログアウトするとブラウザー側のデータに戻ります。クラウドAPIは引き続き認証必須です。

API（Go、`server/`）は、アカウントのクラウド保存をDBから読みます。GitHubのFine-grainedの個人用アクセストークン（`github_pat_`、v0.54.0 からこれだけ）で認証し、トークンのユーザー本人のデータだけを扱います。`-writable` を付けて起動すると、リストの作成・変更・削除と記録の追加（v0.42.0 から）、端末の作成・変更・削除（v0.44.0 から）、記録の変更・削除（v0.45.0 から）もできます（既定は読み取り専用）。v0.53.0 から、リストの複製、CSV・TSV の取り込みと CSV の書き出し、端末ごとの使用状況、リスト一覧の並べ替えと検索、練習記録・ベスト記録・ホームの集計も含め、Web版でできることはすべて API でもできます。Typle本体とは別に起動し、Vercelの本番には載せません。使い方は [API（Go）](docs/api.md) を参照してください。

上部の「テーマ」からライト・ダーク・システムを選べます。初期設定はシステム（OSの外観に追従）です。選択はブラウザに保存され、再読み込みやページ移動後も維持されます。

## 表示言語（/settings）

サイドバーの「設定 › 一般」で、表示言語を日本語・English・简体中文・繁體中文・Русский・Français から選べます。選ぶとその場で画面全体が切り替わり、選択はCookie（`NEXT_LOCALE`、1年）としてこのブラウザーに保存されます。未設定のときは日本語です。URLは言語によらず同じで、単語リストや記録の内容は翻訳しません。

多言語化には [next-intl](https://next-intl.dev/) を使い、ロケールのルーティングは行いません（`src/i18n/request.ts` がCookieから言語を決めます）。画面の文言は `src/messages/<言語>/<領域>.json` にあり、コードに直接書きません。

- 文言はICU MessageFormatです。件数は `{count, plural, ...}` で各言語の複数形に合わせます。アポストロフィはICUの特殊文字のため、`’` を使います。
- 日本語のファイルが基準で、型（`src/i18n/next-intl.d.ts`）にもなります。キーを追加したら6言語すべてに追加してください。
- `src/core` と `src/plugins` は言語に依存しません。エラーは `AppError`（`src/core/appError.ts`）で `errors` のキーを返し、画面は `useErrorText` で表示します。日付・所要時間・端末名は `useFormat`（`src/i18n/useFormat.ts`）で整形します。
- `tests/i18n.test.cjs` が、全言語のキーとプレースホルダーの一致、ICUの構文、`src` に日本語の文言が直接書かれていないことを確認します。


## ホームのダッシュボード

記録が1件以上あると、ホームに練習の状況を表示します（0件のときは従来の案内）。集計は `src/core/dashboard.ts` にあり、日付・週（月曜はじまり）は端末のローカル時刻で区切ります。

- 今週のまとめ：今週の練習回数・連続練習日数・直近10回の平均正確率・練習時間。増減は先週の同じ曜日・時刻までと比べます。
- 次に練習するリスト：記録なし、3日以上練習していない、直近5回の平均正確率が90%未満のリストを順番に1件ずつ選び、最大3件。「練習する」は `/play?list=<id>` でそのリストを選んだ状態で開きます。
- リスト別の推移：最後に練習した順に、1単語あたりの秒数（所要時間÷単語数）と正確率を直近20回まで表示します。単語数・正確率がない古い記録はそのグラフから除外します。

## コードの構成

Next.js のアプリは1つで、`src` を層に分けています。依存は上から下への一方向だけで、`eslint.config.mjs` が `src/core`・`src/plugins` からの逆向きの import をエラーにします。画面（`src/app`・`src/components`）は保存先プラグインを直接 import できず、ワークスペースと保存場所（`storage`：`browser` / `account`）は `useWordLists()` から受け取ります。

| 層 | 場所 | 内容 |
|---|---|---|
| 画面 | `src/app`・`src/components`・`src/i18n`・`src/lib` | ページ、UI、多言語化、React のフック。`useWordLists` は React の状態とブラウザーのイベント（フォーカス・他タブの変更）だけを受け持ち、読み込み・保存は core の `createWorkspaceSession` に任せます |
| プラグイン | `src/plugins` | core のポートの実装と初期データ。`storage`：`cloud`（Goのバックエンドが提供する `/api/workspace`）と `guest`（LocalStorage）を `workspaceStore(accountId)` がアカウントに応じて選びます。`formats`：CSV・TSV（`delimited.ts`）と旧バージョンのブラウザー保存からの移行（`legacy.ts`）。`packs`：最初に表示する単語リスト（サンプル、国名193か国、Linux・Vercel CLI・gcloud・AWS CLI・macOS（zsh）・Arch Linux・Vim・Go構文・Java構文・Kotlin構文・PostgreSQL構文・Prisma構文・Jest構文・Playwright構文の18種類。40語を超えるものは初級・中級・上級に分け、全部で64リスト。v0.75.0 から TypeScript・Hono・PHP・Rails・Express・Oracle PL/SQL・SQL Server T-SQL の7種類を3つずつ加えて85リスト） |
| core | `src/core` | React・Next.js・ブラウザーAPIに依存しない TypeScript。単語リスト・入力判定・記録・集計・ワークスペースのモデルと検証、保存先のポート `WorkspaceStore`（`workspaceStore.ts`、保存場所 `location` を含む）、ワークスペースの読み込み・保存 `createWorkspaceSession`（`workspaceSession.ts`。アカウントの切り替え後に届いた結果の破棄、保存の直列化、409での再読み込み、古いクラウド読み込みの無視）とファイル形式のポート `WordFormat`（`wordFormat.ts`） |

保存先を増やすときは `WorkspaceStore` を実装したプラグインを `src/plugins/storage` に追加し、`workspaceStore` で選びます。ファイル形式を増やすときは `WordFormat` を実装して `src/plugins/formats/index.ts` の一覧に加えると、取り込みの拡張子判定と `accept` に反映されます。どちらも画面のコードは変わりません。

API（`server/`）はNext.jsとは独立したGoのコードで、モジュールはリポジトリ直下の `go.mod` です。`internal/auth` がGitHubのトークンからアカウントを確かめ、`internal/store` が `typle_workspaces` を読み（`-writable` のときは行をロックして書き込み）、`internal/workspace` がそれをアプリの `decodeLists`・`decodeDevices` と同じ規則で検証して、リスト・記録・端末の変更もアプリと同じ規則で検証し、`internal/api` がHTTPで返し、`cmd/typle-api` が起動します。標準ライブラリ以外の依存は、PostgreSQLのドライバー（pgx）、名前を日本語の照合で並べる `golang.org/x/text`、エラー報告の `sentry-go` だけです。

アプリ自身のバックエンド（v0.55.0 から）も同じ `server/` にあり、Next.js の `/api` は使いません。

| 場所 | 内容 |
|---|---|
| `server/internal/web` | GitHub ログイン（`/api/auth/session`・`signin`・`signout`・`callback/github`、アプリ用の `token`）、`/api/workspace`（読み込みと、`revision` による保存）、`/api/health` を1つの `http.Handler` にまとめます。すべての応答に、`next.config.mjs` と同じ4つのセキュリティヘッダー（`Content-Security-Policy`・`X-Frame-Options`・`X-Content-Type-Options`・`Referrer-Policy`）を付けます。ローカル開発のログイン（`POST /api/auth/local`）もここにあり、`typle-web` でだけ有効です |
| `server/internal/session` | ログインの Cookie（`HttpOnly`・`SameSite=Lax`・有効期限30日）と、iPad・Android・Windows のログインのコード・トークンの署名と検証です。値は `AUTH_SECRET` から導いた鍵（種類ごとに別）で HMAC-SHA256 署名します。名前は `AUTH_URL` が HTTPS なら `__Host-typle-session`、HTTP なら `typle-session` です |
| `server/internal/auth` | `/api/v1` のトークン確認のほか、アプリのログイン用の GitHub OAuth クライアント（認可コードと PKCE）を持ちます |
| `server/vercel` | `web` のハンドラーを Vercel の Go の関数として呼ぶ橋渡しです。リポジトリ直下の `api/health.go`・`api/workspace.go`・`api/auth/*.go`（`api/auth/token.go` を含む）がこれを呼びます。`/api/health` はログインの設定（`AUTH_SECRET`・`AUTH_URL`）がなくても DB だけで答え、`/api/workspace` はログインの設定がなければ DB を開かずに 503（`authUnavailable`）を返します |
| `server/cmd/typle-web` | `web` のハンドラーを手元で起動します（既定 `127.0.0.1:8081`）。`npm run dev` と E2E が使います |
| `server-kotlin/` | `typle-web` と同じ API の Kotlin（Ktor）版です。`TYPLE_BACKEND=kotlin` のとき `npm run dev` と E2E が Go の代わりに使います。本番には載せません（[server-kotlin/README.md](server-kotlin/README.md)） |
| `server/internal/serve` | `typle-web` と `typle-api` の待受です。止めるとき（SIGINT・SIGTERM）は、処理中のリクエストが終わるまで最大5秒待ってから DB を閉じます |

### iPad と Mac と Android と Windows のログイン

iPad アプリ（`ios/`）・Mac アプリ（`macos/`）・Android アプリ（`android/`）・Windows アプリ（`windows/`）は、Web版と同じ GitHub OAuth App でログインし、Cookie の代わりにトークンを使います（RFC 8252 のネイティブアプリの形）。サーバーの側は `client` が `ipad`・`macos`・`android`・`windows` のどれかだけが違い、流れは同じです。

1. アプリが32バイトの乱数から検証値（verifier）を作り、システムのログイン画面（iPad と Mac は `ASWebAuthenticationSession`、Android は Custom Tabs、Windows は既定のブラウザー）で `/api/auth/signin?client=<ipad|macos|android|windows>&code_challenge=<S256>` を開きます。チャレンジは OAuth の Cookie に入り、GitHub にはサーバー自身の PKCE を使います。
2. `callback/github` は Cookie を発行せず、`typle-r://login?code=<コード>` へリダイレクトします。コードはユーザーとチャレンジに署名したもので、2分で切れます。失敗・キャンセルは `typle-r://login?error=loginFailed` です。Android は `MainActivity` の intent-filter（scheme `typle-r`・host `login`）で、Windows は起動のたびに登録するプロトコル（`typle-r`、この Windows ユーザーの `HKEY_CURRENT_USER`）でこの URL を受け取ります。Windows では、ブラウザーが開いた2つ目の Typle が、動いている Typle にこの URL を渡して終わります。アプリを離れてコールバックが来なかったときは、何も起きなかったものとして戻ります（Windows は「ログインをやめる」で待つのをやめます）。
3. アプリが `POST /api/auth/token`（`{"code","verifier"}`）を呼び、検証値の SHA-256 がチャレンジと一致すれば `{"token","user"}` を返します。コードを横取りしても、検証値がなければトークンにできません。間違いはすべて `400 loginFailed` です。Android と Windows は、ログインを始めてから10分たったログイン途中の状態は無効とし、ログインに失敗したものとして扱います。
4. アプリは `Authorization: Bearer <トークン>` で `/api/auth/session` と `/api/workspace` を呼びます。トークンは Cookie と別の鍵で署名した有効期限30日の値で、Cookie の値をトークンとして、トークンを Cookie として使うことはできません。`Authorization` ヘッダーがある要求はトークンだけで判断し（Cookie は見ません）、ブラウザーが自動では付けないため、`PUT /api/workspace` の Origin の確認は要りません（`Content-Type` の確認は残ります）。
5. 発行から24時間たったトークンは、`/api/auth/session` の応答の `token` で新しくなります。ログアウトはアプリがトークンを消すだけです（Cookie と同じく、サーバーには取り消す記録がありません）。トークンは iPad と Mac では Keychain に、Android では Android Keystore の鍵で暗号化して、Windows では Windows のデータ保護（DPAPI）で暗号化して保存します。

Android のエミュレーターから手元の `npm run dev` で試すときは、サーバー URL に `http://10.0.2.2:<ポート>`（エミュレーターから見たホストの `localhost`）を入れます。ただし GitHub の OAuth App の callback URL は `AUTH_URL` に合わせたもの（`<AUTH_URL>/api/auth/callback/github`）でなければならず、開発用ログイン（`POST /api/auth/local`）はアプリでは使えません。

画面は `src/lib/session.tsx` の `useSession`・`signIn`・`signOut` で `/api/auth/*` を呼びます。ログイン状態は `/api/auth/session` の 200 の答えだけで決め、確認が失敗したとき（通信の失敗、200 以外の答え、読めない本文）は前の状態のままにします。最初の確認だけは 1・2・4 秒後にやり直し、すべて失敗したら未ログインとして扱います。手元と E2E では、`next.config.mjs` が `/api/workspace`・`/api/health`・`/api/auth/*` を `TYPLE_WEB_URL`（既定 `http://127.0.0.1:8081`）へ転送します。Vercel 上では転送せず、同じパスの Go の関数が応答します。エラーは `SENTRY_DSN`（なければ `NEXT_PUBLIC_SENTRY_DSN`）で Sentry に送ります（[docs/sentry.md](docs/sentry.md)）。

## OGP・共有画像

Open GraphとXの大きな画像カードに対応しています。共通画像は `public/og-image.png`（1200 × 630 PNG）、タイトル・説明・代替テキストは `src/app/layout.tsx` に定義しています。

画像の絶対URLには `SITE_URL`（任意）、次に `AUTH_URL` を使用し、未設定なら `VERCEL_PROJECT_PRODUCTION_URL`、ローカルでは `http://localhost:3000` にフォールバックします。本番ビルド時は `AUTH_URL` を公開サイトのHTTPS URLに設定してください。共有先のクローラーがページと画像へ認証なしでアクセスできる必要があります。


## v0.13.1 — CSV取り込み時のデータ保持

CSV・TSVから読み込んだ単語の前後空白・改行・順序・重複を保存時にも保持します。区切り文字だけの不正行を黙って省略せず、行番号付きで拒否します。既存CSVの補足列の誤記 `anotation` は `annotation` として受け付けます。

「リストを作成」→「CSV・TSVファイルから追加」→内容・リスト名を確認→「保存」で、ログイン中のアカウントへ追加できます。既存リスト・練習記録の保持、同名エラー、保存失敗からの再試行を実DBのブラウザテストで確認しています。CSV/JSONファイルの書き出しは未対応です。

## v0.10.0 — 国名193か国・LAN起動

国名193か国を追加し、LAN内の別端末からの練習・記録保存と `npm run dev:lan` に対応しました。

本番: https://typle-r-six.vercel.app

リポジトリ: https://github.com/Sparklingstadt/typle-r （非公開）

本番はGitHub認証とNeon DB、ローカル/LANは開発用アカウントとDocker DBを使用します。開発ログインは本番では無効です。

## Sparklingstadt private copy

`liyur-qie/typle-r` の履歴を保持した独立した非公開コピーです。

国名：中国語・国連加盟193か国を初期リストとDB seedに追加しています。表示は中国語、入力は声調記号なしのピンイン（例: 阿尔巴尼亚 → Aerbaniya）、補足はピンイン / 日本語です。提供ZIPの作成元データを保持し、既存リスト・練習記録を上書きしません。

### このMacで起動

```sh
npm run dev:local
```

http://localhost:3000/local-login を開き「練習を始める」を押します。このMacのチェックアウトの `.env.local` は設定済みです。新規クローンでは上記のセットアップ後、`.env.local` に `LOCAL_DEVELOPMENT_LOGIN=1` を設定し、`npm run db:seed -- --owner github:0` を実行してください。DBは `docker compose --env-file .env.local up -d --wait` で再開できます。

開発ログインは `NODE_ENV=development`、`LOCAL_DEVELOPMENT_LOGIN=1`、`AUTH_URL` がHTTPのloopbackまたは明示指定したLAN内IPv4、`AUTH_SECRET` 設定済みのすべてを満たす場合だけ有効です。専用アカウント `github:0` を使用し、GitHubアカウントとは分離します。本番ビルドでは無効です。GitHub OAuthを使用する場合は `LOCAL_DEVELOPMENT_LOGIN=0` とし、従来どおりOAuthの設定を行ってください。

## v0.9.0 — 練習画面の改善とE2E拡充

練習画面に選択中リストのベスト記録5件を表示し、単語リストと左右に配置しました。アカウントの丸アイコン、選択中ボタン、補足の重ね表示にも対応しています。冪等なDB seedを追加し、共通テーブルとボタングループを整理しました。ローカルE2Eは14件に拡充しています。

## DB seed

マイグレーション後、対象アカウントのGitHub数値IDを指定して実行します。

```sh
npm run db:seed -- --owner github:123456
```

`123456` は対象ユーザーの数値IDに置き換えてください（ユーザー名ではありません）。`npx prisma db seed -- --owner github:123456` でも実行できます。

- `Test 1`: hoge / foo / bar
- `test 2`: one / two / three

表示文字と入力文字は同じ、補足・記録は空で作成します。固定ID、または同名（大文字小文字を区別しない）のリストがあれば追加せず、既存の内容と記録を保持します。再実行で変更がなければrevisionも更新しません。同時実行はSerializableトランザクションと再試行で処理します。対象アカウントは自動選択しません。

## v0.8.0 — ナビゲーションと通知の改善

アイコン付きの折り畳みサイドバー、トップバーのホームリンク、ベスト記録のテーブル表示を追加しました。保存・削除成功時は、画面下部のトーストで通知します。通知は複数件のスタックと出現・終了アニメーションに対応しています。

本番ビルド（型チェックを含む）とブラウザでの削除通知表示を確認。ユーザー指示によりLint・E2Eは未実施です。GitHub CI・Vercelデプロイの停止を維持しています。

## v0.7.0 — 練習画面と単語編集UIの改善

Noto Sans JPを全画面に適用し、練習画面の文字色分け・進捗バッジ・結果テーブルを追加しました。単語編集はレスポンシブなテーブルとなり、「入力」「補足」の開閉、入力文字の自動連動、アイコンによる並べ替え・削除に対応しています。

本番ビルド（型チェックを含む）を確認しています。ユーザー指示により今回のLint・E2Eは未実施です。GitHub CI・Vercelデプロイは停止を維持しています。

## v0.6.0 — shadcn/uiへの移行

shadcn/ui（Radix / Nova）で画面を再実装しました。ボタン・入力欄・テーブル・カード・通知を統一し、削除確認は失敗時に再試行できるAlertDialogへ移行しています。既存の認証・保存形式・画面URLは維持しています。

ローカルでビルド・型チェック・Lint、単体・実DBテスト10件、E2E 9件が通過。390px・1440px幅の表示を確認しています。

## v0.5.1 — コード構成の整理

認証レイアウトを共通化し、練習ロジック・API通信・記録操作を画面から分離しました。既存の画面URLと保存形式を維持しています。ローカルのビルド・型チェック・Lint、単体・実DBテスト10件、E2E 9件が通過しています。

## v0.5.0 — 依存関係更新

Next.js 16.3.4、React 19.2.8、Tailwind CSS 4.3.3、TypeScript 6.0.3、ESLint 9.39.5へ更新しました。Next.jsはTurbopack、Tailwindは専用PostCSSプラグイン、LintはESLint CLIのflat configを使用します。

TypeScript 7とESLint 10は既存Lintプラグインの対応範囲外のため採用していません。Prismaは正式版7.10、Auth.jsは導入済みの5.0.0-beta.32を維持しています。Node型定義は実行環境に合わせ24系を使用します。

Tailwind 4の対象ブラウザーはSafari 16.4以上、Chrome 111以上、Firefox 128以上です。

## v0.4.0 — Prisma

Prisma 7.10のClientとMigrateで保存処理を管理します（v0.55.0 から保存処理は Go が行い、Prisma はマイグレーションと seed だけに使います）。既存の `typle_workspaces` を `Workspace` モデルに対応付け、JSONB・所有者ID・revision・DB制約を維持しています。Clientはプロセス内で再利用し、revisionの条件付き更新で同時書き込みの衝突を検出します。

既存のv0.2.x/v0.3.x DBは、初回のみ `npm run db:baseline` を実行してください。スキーマ一致を確認した上で履歴を登録します。新規DBと以後の更新は `npm run db:migrate` を使用します。`migrate reset` や `db push` は通常運用では使用しません。

`npm ci` とビルド時にPrisma Clientを生成します。スキーマ変更後は `npm run db:generate` でも生成できます。マイグレーションSQLは `prisma/migrations` にあります。PostgreSQLのCHECK制約はSQL側で管理します。

## v0.3.0

Tailwindへの統一後に残っていたSass・Immutableをインストール情報とロックファイルから除去しました。Emotion・MUIもソース・直接依存・ロックされたパッケージに含まれません。Next.js内部で必要な `styled-jsx` は維持しています。

## v0.2.2

UIを標準HTMLとTailwind CSSのみで実装しています。MUI・Emotion・Sassは使用しません。共通のボタンと入力欄は `src/components/ui` にあります。モバイル幅ではナビゲーションを画面上部に配置します。

## v0.2.0

- Auth.jsによるGitHubログイン
- ユーザーごとの単語リスト・練習記録をPostgreSQLに保存
- NeonとDockerのPostgreSQL接続に対応（Prisma + pgアダプター）
- v0.1.xのlocalStorageデータをホームから明示的に移行（元データは保持）
- 同時更新はrevisionで検出し、他の画面の変更を上書きせず再試行を案内

練習、リスト作成・編集・並べ替え、記録削除、個人ベスト表示を利用できます。保存には接続が必要です。初回はサンプルを表示し、最初の変更時に保存します。

## Dockerでの仮運用

Node.js 24以上、npm、Go 1.25以上、Docker Composeを使用します。

```sh
npm ci
node scripts/setup-local.cjs
docker compose --env-file .env.local up -d --wait
npm run db:migrate
```

`setup-local.cjs` はランダムなDBパスワードとAUTH_SECRETを `.env.local` に生成します。既存ファイルは上書きしません。DBは `127.0.0.1:5433` のみ公開し、名前付きボリューム `typle-r_postgres_data` にデータを保持します。

GitHubの Settings → Developer settings → OAuth Apps でローカル用OAuth Appを作成します。

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

Client IDとClient secretを `.env.local` の `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` に設定します。秘密値はコミットしないでください。

```sh
npm run dev
```

`npm run dev` は2つのプロセスを起動します。Go のバックエンド（`go run ./server/cmd/typle-web`、`127.0.0.1:8081`）と `next dev`（`127.0.0.1:3000`）で、どちらかが止まるともう片方も止めます。`go` コマンドがないときは、メッセージを出して終了します。バックエンドは `.env.local` の値を使い、起動のたびにコンパイルするため、初回は少し時間がかかります。`npm run dev:local`・`npm run dev:lan` も同じです。`TYPLE_WEB_URL` を設定すると、`next.config.mjs` の転送先と、バックエンドの待受（その URL のホストとポート）の両方がそこに変わります。バックエンドは HTTP だけで待ち受けるため、`TYPLE_WEB_URL` が `https://` の URL なら起動せずにメッセージを出して終了します。DB に接続できなくても起動し、その間 `/api/workspace`・`/api/health` は 503（`databaseUnavailable`）を返しますが、ログインは使えます。GitHub のログインは `AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET` が揃っているときだけ使え、揃っていなければ `/api/auth/signin` だけが 503 になります（開発ログインだけで開発できます）。`TYPLE_BACKEND=kotlin` を付けると、Go の代わりに Kotlin のバックエンド（`server-kotlin`、JDK 21 が必要）を同じアドレスで起動します（先に `server-kotlin/gradlew installDist` でビルドします）。

[ローカルアプリ](http://localhost:3000) を開いてGitHubでログインします。通常の停止は `docker compose --env-file .env.local stop`、再開は `up -d --wait` です。`down -v` は保存データを削除するため使用しないでください。

## Neon / Vercelの構成

Vercel MarketplaceでNeonを接続し、サーバー用の環境変数を設定します。

- `DATABASE_URL`: NeonのPostgreSQL接続URL（pooled接続可、`POSTGRES_URL`も代替として利用可能）
- `DIRECT_URL`: マイグレーション用の直接接続URL（任意、未指定時はDATABASE_URL）。DATABASE_DRIVERは不要です。
- `AUTH_SECRET`: 暗号学的にランダムな秘密値
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`: 本番用OAuth Appの認証情報
- `AUTH_URL`: 本番URL。本番OAuth callbackは `<本番URL>/api/auth/callback/github`（v0.55.0 でも変わりません）。Go はこの値のオリジンだけを使います

Go の関数（`api/*.go`）も同じ環境変数を読むため、Vercel の設定は増やしません。対象DBの環境変数を使って `npm run db:migrate` を実行してからデプロイします。DockerのDBからNeonへのデータコピーは自動ではありません。必要な場合はバックアップと復元を別途行います。本番への反映は検証済みのコミットからGitHub Actions内のVercel CLIで行います。

公式資料: [GitHub OAuth App](https://docs.github.com/ja/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[Prisma](https://www.prisma.io/docs/orm/v7)、[PostgreSQL Docker image](https://hub.docker.com/_/postgres)。

## 保存とアクセス制御

`typle_workspaces` テーブルにユーザーごとのJSONBスナップショットとrevisionを保持します。APIとログインはGoのバックエンド（`server/`）が提供し、所有者はサーバーがログインセッション（iPad はトークン）のGitHubユーザーIDから決定します。APIは未認証アクセスを拒否し、書き込みでOrigin（Cookie のとき）、アカウント一致、形式、最大1MiBのサイズを検証します。共有ランキングはありません。

旧形式のキーは `typle-r:word-lists:v1`、値は `{ version: 1, lists: [...] }` です。ホームの移行ボタンは現在のアカウントに追加し、同じ内容の再移行を重複させません。同名のリストは名前に移行番号を付けます。壊れた元データは変更しません。リスト削除はその記録も削除します。

## 検証

Dockerを起動してマイグレーションを実行した状態で（Go 1.25以上が必要です）:

```sh
npm run typecheck
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Kotlin のバックエンドは `cd server-kotlin && ./gradlew test` で確かめ、`TYPLE_BACKEND=kotlin npm run test:e2e` で同じ E2E を Kotlin を相手に流せます（先に `./gradlew installDist`。CI では `Kotlin backend` のワークフローが行います）。

Goのバックエンドと API はリポジトリ直下で `gofmt -l .`・`go vet ./...`・`go test ./...` を実行します。ログインの Cookie、GitHub の OAuth（`httptest` で作った偽の GitHub を相手にします）、`/api/workspace`（検証・`revision` の競合・`409`）、iPad・Mac・Android・Windows のログイン（コード・トークン・Bearer）、セキュリティヘッダーなど、`server/internal/web` のハンドラーのテストも含みます。マイグレーション済みのテスト用DBを `TYPLE_TEST_DATABASE_URL` で指定すると、DBの読み書きも確かめます（CIの `verify` は `db:migrate` の後に実行します）。

`npm test` は入力判定、記録、移行、形式検証などの単体テストです。E2Eは上限2 workersでファイル内も並列実行します。テストごとにランダムなアカウントIDを使用します。Playwright が Go のバックエンド（`go run ./server/cmd/typle-web`、ポート8081）と、本番ビルドの `next start`（ポート3101）を両方起動し、実PostgreSQLとAPIを通して作成・編集・練習・再読み込み・削除、アカウント分離、401/403/409応答を確認します。GitHub にはつながず、`tests/e2e/sessionCookie.ts` がテスト専用の秘密値で署名したログインの Cookie を作ります（Go の `server/internal/session` と同じ値になることは `tests/sessionCookie.test.cjs` が確かめます）。GitHub OAuth画面の実ログインは自動テストできないため、公開後に本番で別途確認が必要です。テストユーザーの行だけを終了後に削除します。

元リポジトリではGitHub ActionsのCIを停止していました。この独立コピーにはCI定義を引き継いでいます。開発ビルド `.next` と本番ビルド `.next-production` は分離しています。

## リリース

必須の順序は **PR作成 → squash merge → マージ後のverify → GitHub Release作成 → Vercel本番デプロイ** です。`package.json` と `package-lock.json` のバージョンをPR内で更新します。mainへの直接push、手動タグ・Release作成、手動デプロイは行いません。`vercel.json` の `git.deploymentEnabled=false` は維持し、GitHub ActionsがReleaseとデプロイを順番に実行します。初回設定・Secrets・復旧手順は [リリース運用](docs/release-workflow.md) を参照してください。

## 依存関係の監査

2026-09-06の更新時点で `npm audit` の指摘は0件です。Prisma 7.10の開発ツールが固定する依存に対し、`@prisma/config` のdeepmerge-tsを8.0.2、Prisma内のmysql2を3.24.3へ限定的にoverrideしています。Prismaの生成・マイグレーション・実DBテストを確認済みです。Prisma本体が修正版を採用したらoverrideを見直してください。

## UIコンポーネント

UIはshadcn/ui（Radix / Nova）とTailwind CSS 4で構成しています。設定は `components.json`、テーマは `src/app/globals.css`、コンポーネントのソースは `src/components/ui` にあります。追加は `npx shadcn@latest add <component>` で行えます。ボタンの既定typeはフォームの誤送信を避けるため `button`、標準の高さは44pxに調整しています。

削除確認はAlertDialogを使い、失敗時はダイアログ内で再試行できます。入力欄のラベル・必須属性、IME入力、認証とDB保存は維持しています。

### 国名データの出典・検証

[提供されたZIP](https://chatgpt.com/library/share/libfile_e75c8143a78c8191804af85bfd9d46a9?account_id=personal)と同じファイルの生成データ193行を利用しています。中国語名・拼音・日本語名は元資料の表記を維持しています。入力する文字は拼音から声調記号・隔音記号（'）・括弧を除いたアルファベットで、üはピンイン入力と同じvで入力します（例: 菲律宾 → Feilvbin）。`tests/countries.test.cjs` で元データ（入力を中国語名に戻し、中国語名の順に並べた状態。v0.74.0 から初級〜上級の5リストに分けたため）とのSHA-256一致、193件の重複なし、入力が拼音から作られていることを検証します。

入力を小文字にした「国名：中国語・国連加盟193か国（小文字）」（v0.69.0 から。v0.74.0 から「国名：中国語・国連加盟国（小文字・初級1）」〜「（小文字・上級2）」の5リスト）も初期リストにあります。表示・補足は同じで、入力は上のリストの拼音を小文字にしたものです。空白は残します（例: 安提瓜和巴布达 → `antigua he babuda`）。`src/plugins/packs/commands.json` の最後のリストで、保存済みのアカウントにはマイグレーション `0015_seed_lowercase_country_list` が追加します（コマンドのリストと同じ規則）。

### コマンドの単語リスト（Linux・Vercel CLI・gcloud・AWS CLI・macOS・Arch Linux・Vim・Go・Java・Kotlin・PostgreSQL・Prisma・Jest・Playwright）

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

初期リストなので、まだ一度も保存していないアカウントとブラウザーには最初から表示されます。v0.63.0 から、すでに保存しているアカウントにも、マイグレーション `0009_seed_command_lists`（`npm run db:migrate`。本番ではデプロイ時に実行）が9リストを、v0.64.0 から `0010_seed_arch_linux_list` がArch Linuxのリストを、v0.65.0 から `0011_seed_vim_list` がVimのリストを、v0.66.0 から `0012_seed_go_syntax_list` がGo構文のリストを、v0.67.0 から `0013_seed_java_syntax_list` がJava構文のリストを、v0.68.0 から `0014_seed_kotlin_syntax_list` がKotlin構文のリストを、v0.71.0 から `0016_seed_postgresql_syntax_list` がPostgreSQL構文のリストを、v0.72.0 から `0017_seed_test_framework_lists` がPrisma・Jest・Playwright構文の3リストを、v0.75.0 から `0019_seed_framework_and_sql_lists` がTypeScript・Hono・PHP・Rails・Express・Oracle PL/SQL・SQL Server T-SQLの21リストを追加します。小文字の国名リストも、同じ規則で `0015_seed_lowercase_country_list` が追加します。`scripts/seed.cjs` と同じく、同じIDまたは同じ名前のリストがある場合はそのリストを追加せず、ほかのリストと練習記録はそのまま残します。追加すると100リストか保存できる大きさ（`MaxListsBytes`）を超えるアカウントには追加しません。マイグレーションは1回だけ実行されるため、その後に削除したリストは戻りません。改めて追加するときは `npm run db:seed -- --owner github:<ID>` を使います。このブラウザーに保存している場合（ログインしていない場合）はマイグレーションの対象外です。

上の表の語数は元のリストのものです。v0.74.0 から、40語を超えるリストは初級・中級・上級などに分けて `commands.json`・`countries.json` に入れています（分け方は v0.74.0 の説明、確かめ方は `tests/commands.test.cjs`）。保存済みのアカウントでは `0018_split_long_initial_lists` が分けたリストに置き換えます。

### 共通レイアウト（トップバー・サイドバー）

トップバー（高さ56px）は画面上部に固定し、ロゴ、保存先（「このブラウザーに保存」／「アカウントに保存」）、テーマ切り替え、ログインまたはアカウントメニューを置きます。1280px以上ではトップバーの下に幅240pxのサイドバーを固定し、「ホーム」「練習（練習する・練習記録・ベスト記録）」「単語リスト（単語リスト・リストを作成）」「設定（一般・端末）」と、下部のヘルプ（使い方・Typleについて・GitHub）を表示します。1279px以下（スマホのほか、ノートPCや画面を半分にしたウィンドウ）ではメニューボタンからドロワーを開き、ページの幅を広く使います。ドロワーはEsc・背景のタップ・リンクの選択で閉じ、フォーカスはメニューボタンに戻ります。最初のTabで「本文へスキップ」が表示されます。デザインレビューは `docs/design/layout-review.md` を参照してください。

### 使い方（/guide）

使い方のページは、はじめの3ステップ（練習する・リストを作成・ベスト記録へのリンク）と、目次から開ける6つのセクション（練習する・単語リストを作る・結果と記録を見る・端末を登録する・保存先とデータ・キーボード操作）で構成します。目次は1280px以上で本文の右に固定し、それより狭い画面では見出しの下に表示します。各セクションは `/guide#storage` のようにURLで直接開けます。入力の色の見本は練習画面と同じ部品で表示します。デザインレビューは `docs/design/guide-page-review.md` を参照してください。

### Typleについて（/about）

できること（リストを作成・練習する・ベスト記録）、データの保存先（このブラウザー／アカウントの比較と今の保存先）、不具合の報告で送る情報、バージョン（`package.json` の値）と使用している技術をまとめています。ソースコードのリンクは新しいタブで開き、非公開のリポジトリであることを表示します。デザインレビューは `docs/design/about-page-review.md` を参照してください。

### LAN内の別端末から利用

`.env.local` の `AUTH_URL` を `http://<このMacのLAN IP>:3000`、`LOCAL_DEVELOPMENT_LAN_HOST` を同じIPに設定し、`npm run dev:lan` で起動します。別端末から同じURLの `/local-login` を開いてください。LAN用の開発ログインは明示指定したプライベートIPv4に限って有効で、本番では無効です。接続できるLAN内の利用者は、同じローカル練習用データを利用できます。DBポートは引き続きloopbackのみで待ち受けます。

`dev:lan` は `.env.local` のLANアドレスと `AUTH_URL` のポートを使用します。IPアドレスが変わった場合はこの2設定を更新してください。

### CSV・TSVから単語を追加

「単語リストを作成」または編集画面の「CSV・TSVファイルから追加」でUTF-8のファイルを選び、読み込んだ内容を確認・修正して保存します。入力中の単語は残し、末尾に追加します。リスト名が空の場合はファイル名を使います。

```csv
input,display,annotation
Japan,日本,国名
France,フランス,
```

`input` と `display` は見出し・各行の値とも必須です。`annotation` はカラム自体も値も省略できます。見出しの順番は自由で、その他のカラム名・重複した見出しはエラーになります。TSVではタブで区切ります。補足列の誤記 `anotation` も受け付けます。単語の前後空白・順序・重複は保存時にも保持します。引用符で囲ったカンマ・タブ・改行、二重引用符のエスケープ（`""`）、UTF-8 BOMに対応します。ファイル上限は1 MiB、単語数は1リスト1,000件です。

### プロファイルの廃止（v0.34.0）

v0.29.0〜v0.33.x では、1つのアカウント（またはブラウザー）に複数のプロファイルを作り、単語リストと練習記録を分けて保存できました。v0.34.0 でこの機能を廃止し、単語リストは1つにまとめました。

- 追加したプロファイルの単語リストは、最初のプロファイルのリストの後ろへ記録ごと移します。アカウントのデータは v0.35.1 のマイグレーション `0006_merge_profiles` でまとめて移し、ブラウザーのデータは次に読み込んだときに移します。名前が重なるリストは「名前（プロファイル名）」に、IDが重なるリストは `<プロファイルID>-<リストID>` にします。共有中のリストはリンクを変えずに移していました（共有リンクは v0.36.0 で廃止）。
- 移したデータは revision を1つ上げて一度だけ保存します。デプロイの切り替え中に古い画面が古い revision で保存しても `409` になり、移したリストを上書きしません。古い画面がメイン以外のプロファイルへの保存やプロファイルの変更を送った場合も `409` を返します。
- `typle_workspaces.profiles` 列と `typle_shared_lists.profile_id` 列は、v0.35.1 でアプリが使わなくなったあと、v0.35.2 のマイグレーション `0007_drop_profile_columns` で削除しました。共有リンクは1つのリストに1つで、`0006_merge_profiles` が追加した一意インデックス（`owner_id`・`list_id`）で守っていました（v0.38.0 のマイグレーション `0008` でテーブルごと削除）。ローカルでは `npm run db:migrate` で適用してください。
- 移したあとのリストが上限（当時は100個、v0.76.0 から150個）を超えても、そのまま練習・編集・削除できます。上限以下になるまでは新しいリストを追加できません。保存は毎回リスト全体を送るため、リスト全体が1MBを超えていると、削除も含めて保存できません（以前は Typle API でリストを削除して小さくできましたが、v0.36.0 で廃止しました）。

### 練習に使用した端末の記録

サイドバーの「端末」で端末名と配列・メモ（例：JIS、US、キーの入れ替え）を登録できます。「練習する」の使用端末を選んで練習すると、結果・記録・ベスト記録に練習時点の端末情報が残ります。練習開始後は端末を変更できません。端末の名前やメモを編集・削除しても、過去の記録は変わりません。

登録した端末はログイン中のアカウントに保存されます。使用端末の選択はブラウザー・アカウントごとに記憶するため、別の端末に選択状態は同期しません。どのアカウントにも組み込みの端末「デフォルト」があり、使用端末を選ぶまではこれで練習します（登録数には数えず、名前の変更と削除はできません）。使用中の端末を削除すると「デフォルト」に戻ります。端末を記録しないときは「未選択」を選びます。未選択での練習と従来の記録は「未記録」と表示します。

「端末」画面では、このブラウザーで練習に使う端末（「練習する」の端末メニューと同じ設定）を変更でき、端末ごとの練習回数と最後に練習した日を確認できます。回数は記録に残した端末IDで数えるため、名前を変えた後も引き継がれます。このブラウザーで使う端末が「デフォルト」か未選択のときに追加した端末は、そのまま練習に使う端末になります（追加時に選択を外せます）。端末は100台まで登録できます。

ローカルでは `npm run db:migrate` で `0002_practice_devices` を適用してください。Vercelではビルド前にマイグレーションを実行し、失敗した場合は新しいアプリを公開しません。既存 workspace に空の端末一覧を追加する migration です。

### ベスト記録

サイドバーの「ベスト記録」では、単語リストごとの自己ベスト・直近5回の平均・平均正確率・所要時間の推移（直近20回）と上位の記録を表示します。一覧は最近練習した順・名前順・記録が多い順に並べ替えと検索ができ、まだ記録のないリストもここから練習を始められます。順位の基準（正確率を優先／速さを優先）と端末での絞り込みを切り替えられ、`/rankings?list=<id>&device=<id>&order=speed` のようにURLに残ります。

リストの単語数を変えた後は、今の単語数で練習した記録だけを比べます。単語数が違う記録（編集前の記録や、単語数を保存していない古い記録）は「含めて表示」で順位に加えられます。今の単語数の記録が1件もないときは、すべての記録で順位を付けます。練習画面の結果・ベスト記録、「練習記録」のベストの印、ホームも同じ基準です。

### 単語リスト

サイドバーの「単語リスト」では、保存した単語リストを1行ずつ、単語の例・単語数・練習回数・最終練習日とともに表示します。リスト名と単語で検索でき、追加した順（新しい順）・最近練習した順・名前順・単語が多い順に並べ替えられます。各行の「編集」で編集画面を開き、「…」から練習・ベスト記録・練習記録・CSVエクスポート・複製・削除を選べます。複製は単語だけを写した「（コピー）」を作り、練習記録は写しません。リストは150件まで保存できます（v0.76.0 から。それまでは100件）。

編集画面は `/edit?list=<id>` で開くため、再読み込みやブラウザーの戻るでも一覧と行き来できます。保存していない変更があるときは、キャンセル・戻る・タブを閉じる前に確認します。単語数を変えると、それまでの記録は残りますがベスト記録の順位に含まれなくなるため、保存バーで案内します。

### 単語リストのCSVエクスポート

「単語リスト」の各リストの「…」から「CSVエクスポート」で、input・display・annotationの3列をUTF-8（BOM付き）で保存できます。単語の順番・重複・空白・改行を保持し、練習記録は含みません。既存のCSV取り込みで再利用できます（取り込みは1 MiB以内・1,000単語まで）。保存済みの内容を出力します。

## Sentry エラー監視

Sentry の接続用環境変数・収集範囲・確認手順は [docs/sentry.md](docs/sentry.md) を参照してください。
