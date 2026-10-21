# Typle


自分の単語リストで練習できるタイピングアプリです。

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
| プラグイン | `src/plugins` | core のポートの実装と初期データ。`storage`：`cloud`（`/api/workspace` とPrisma）と `guest`（LocalStorage）を `workspaceStore(accountId)` がアカウントに応じて選びます。`formats`：CSV・TSV（`delimited.ts`）と旧バージョンのブラウザー保存からの移行（`legacy.ts`）。`packs`：最初に表示する単語リスト（サンプルと国名193か国） |
| core | `src/core` | React・Next.js・Prisma・ブラウザーAPIに依存しない TypeScript。単語リスト・入力判定・記録・集計・ワークスペースのモデルと検証、保存先のポート `WorkspaceStore`（`workspaceStore.ts`、保存場所 `location` を含む）、ワークスペースの読み込み・保存 `createWorkspaceSession`（`workspaceSession.ts`。アカウントの切り替え後に届いた結果の破棄、保存の直列化、409での再読み込み、古いクラウド読み込みの無視）とファイル形式のポート `WordFormat`（`wordFormat.ts`） |

保存先を増やすときは `WorkspaceStore` を実装したプラグインを `src/plugins/storage` に追加し、`workspaceStore` で選びます。ファイル形式を増やすときは `WordFormat` を実装して `src/plugins/formats/index.ts` の一覧に加えると、取り込みの拡張子判定と `accept` に反映されます。どちらも画面のコードは変わりません。

API（`server/`）はNext.jsとは独立したGoのコードで、モジュールはリポジトリ直下の `go.mod` です。`internal/auth` がGitHubのトークンからアカウントを確かめ、`internal/store` が `typle_workspaces` を読み（`-writable` のときは行をロックして書き込み）、`internal/workspace` がそれをアプリの `decodeLists`・`decodeDevices` と同じ規則で検証して、リスト・記録・端末の変更もアプリと同じ規則で検証し、`internal/api` がHTTPで返し、`cmd/typle-api` が起動します。標準ライブラリ以外の依存は、PostgreSQLのドライバー（pgx）と、名前を日本語の照合で並べる `golang.org/x/text` だけです。

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

Prisma 7.10のClientとMigrateで保存処理を管理します。既存の `typle_workspaces` を `Workspace` モデルに対応付け、JSONB・所有者ID・revision・DB制約を維持しています。Clientはプロセス内で再利用し、revisionの条件付き更新で同時書き込みの衝突を検出します。

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

Node.js 24以上、npm、Docker Composeを使用します。

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

[ローカルアプリ](http://localhost:3000) を開いてGitHubでログインします。通常の停止は `docker compose --env-file .env.local stop`、再開は `up -d --wait` です。`down -v` は保存データを削除するため使用しないでください。

## Neon / Vercelの構成

Vercel MarketplaceでNeonを接続し、サーバー用の環境変数を設定します。

- `DATABASE_URL`: NeonのPostgreSQL接続URL（pooled接続可、`POSTGRES_URL`も代替として利用可能）
- `DIRECT_URL`: マイグレーション用の直接接続URL（任意、未指定時はDATABASE_URL）。DATABASE_DRIVERは不要です。
- `AUTH_SECRET`: 暗号学的にランダムな秘密値
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`: 本番用OAuth Appの認証情報
- `AUTH_URL`: 本番URL。本番OAuth callbackは `<本番URL>/api/auth/callback/github`

対象DBの環境変数を使って `npm run db:migrate` を実行してからデプロイします。DockerのDBからNeonへのデータコピーは自動ではありません。必要な場合はバックアップと復元を別途行います。本番への反映は検証済みのコミットからGitHub Actions内のVercel CLIで行います。

公式資料: [GitHub OAuth App](https://docs.github.com/ja/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[Prisma](https://www.prisma.io/docs/orm/v7)、[PostgreSQL Docker image](https://hub.docker.com/_/postgres)。

## 保存とアクセス制御

`typle_workspaces` テーブルにユーザーごとのJSONBスナップショットとrevisionを保持します。APIとログインはGoのバックエンド（`server/`）が提供し、所有者はサーバーがログインセッションのGitHubユーザーIDから決定します。APIは未認証アクセスを拒否し、書き込みでOrigin、アカウント一致、形式、最大1MiBのサイズを検証します。共有ランキングはありません。

旧形式のキーは `typle-r:word-lists:v1`、値は `{ version: 1, lists: [...] }` です。ホームの移行ボタンは現在のアカウントに追加し、同じ内容の再移行を重複させません。同名のリストは名前に移行番号を付けます。壊れた元データは変更しません。リスト削除はその記録も削除します。

## 検証

Dockerを起動してマイグレーションを実行した状態で:

```sh
npm run typecheck
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Goの API はリポジトリ直下で `gofmt -l .`・`go vet ./...`・`go test ./...` を実行します。マイグレーション済みのテスト用DBを `TYPLE_TEST_DATABASE_URL` で指定すると、DBの読み書きも確かめます（CIの `verify` は `db:migrate` の後に実行します）。

単体テストは入力判定、記録、移行、形式検証と実PostgreSQL上のPrismaクエリを検証します。E2Eは上限2 workersでファイル内も並列実行します。テストごとにランダムなアカウントIDを使用します。本番ビルドをポート3101で起動し、実PostgreSQLとAPIを通して作成・編集・練習・再読み込み・削除、アカウント分離、401/403/409応答を確認します。テスト専用秘密値で署名したセッションを使うため、GitHub OAuth画面の実ログインは別途確認が必要です。テストユーザーの行だけを終了後に削除します。

元リポジトリではGitHub ActionsのCIを停止していました。この独立コピーにはCI定義を引き継いでいます。開発ビルド `.next` と本番ビルド `.next-production` は分離しています。

## リリース

必須の順序は **PR作成 → squash merge → マージ後のverify → GitHub Release作成 → Vercel本番デプロイ** です。`package.json` と `package-lock.json` のバージョンをPR内で更新します。mainへの直接push、手動タグ・Release作成、手動デプロイは行いません。`vercel.json` の `git.deploymentEnabled=false` は維持し、GitHub ActionsがReleaseとデプロイを順番に実行します。初回設定・Secrets・復旧手順は [リリース運用](docs/release-workflow.md) を参照してください。

## 依存関係の監査

2026-09-06の更新時点で `npm audit` の指摘は0件です。Prisma 7.10の開発ツールが固定する依存に対し、`@prisma/config` のdeepmerge-tsを8.0.2、Prisma内のmysql2を3.24.3へ限定的にoverrideしています。Prismaの生成・マイグレーション・実DBテストを確認済みです。Prisma本体が修正版を採用したらoverrideを見直してください。

## UIコンポーネント

UIはshadcn/ui（Radix / Nova）とTailwind CSS 4で構成しています。設定は `components.json`、テーマは `src/app/globals.css`、コンポーネントのソースは `src/components/ui` にあります。追加は `npx shadcn@latest add <component>` で行えます。ボタンの既定typeはフォームの誤送信を避けるため `button`、標準の高さは44pxに調整しています。

削除確認はAlertDialogを使い、失敗時はダイアログ内で再試行できます。入力欄のラベル・必須属性、IME入力、認証とDB保存は維持しています。

### 国名データの出典・検証

[提供されたZIP](https://chatgpt.com/library/share/libfile_e75c8143a78c8191804af85bfd9d46a9?account_id=personal)と同じファイルの生成データ193行を利用しています。中国語名・拼音・日本語名は元資料の表記を維持しています。入力する文字は拼音から声調記号・隔音記号（'）・括弧を除いたアルファベットで、üはピンイン入力と同じvで入力します（例: 菲律宾 → Feilvbin）。`tests/countries.test.cjs` で元データ（入力を中国語名に戻した状態）とのSHA-256一致、193件の重複なし、入力が拼音から作られていることを検証します。

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
- 移したあとのリストが上限の100個を超えても、そのまま練習・編集・削除できます。100個以下になるまでは新しいリストを追加できません。保存は毎回リスト全体を送るため、リスト全体が1MBを超えていると、削除も含めて保存できません（以前は Typle API でリストを削除して小さくできましたが、v0.36.0 で廃止しました）。

### 練習に使用した端末の記録

サイドバーの「端末」で端末名と配列・メモ（例：JIS、US、キーの入れ替え）を登録できます。「練習する」の使用端末を選んで練習すると、結果・記録・ベスト記録に練習時点の端末情報が残ります。練習開始後は端末を変更できません。端末の名前やメモを編集・削除しても、過去の記録は変わりません。

登録した端末はログイン中のアカウントに保存されます。使用端末の選択はブラウザー・アカウントごとに記憶するため、別の端末に選択状態は同期しません。どのアカウントにも組み込みの端末「デフォルト」があり、使用端末を選ぶまではこれで練習します（登録数には数えず、名前の変更と削除はできません）。使用中の端末を削除すると「デフォルト」に戻ります。端末を記録しないときは「未選択」を選びます。未選択での練習と従来の記録は「未記録」と表示します。

「端末」画面では、このブラウザーで練習に使う端末（「練習する」の端末メニューと同じ設定）を変更でき、端末ごとの練習回数と最後に練習した日を確認できます。回数は記録に残した端末IDで数えるため、名前を変えた後も引き継がれます。このブラウザーで使う端末が「デフォルト」か未選択のときに追加した端末は、そのまま練習に使う端末になります（追加時に選択を外せます）。端末は100台まで登録できます。

ローカルでは `npm run db:migrate` で `0002_practice_devices` を適用してください。Vercelではビルド前にマイグレーションを実行し、失敗した場合は新しいアプリを公開しません。既存 workspace に空の端末一覧を追加する migration です。

### ベスト記録

サイドバーの「ベスト記録」では、単語リストごとの自己ベスト・直近5回の平均・平均正確率・所要時間の推移（直近20回）と上位の記録を表示します。一覧は最近練習した順・名前順・記録が多い順に並べ替えと検索ができ、まだ記録のないリストもここから練習を始められます。順位の基準（正確率を優先／速さを優先）と端末での絞り込みを切り替えられ、`/rankings?list=<id>&device=<id>&order=speed` のようにURLに残ります。

リストの単語数を変えた後は、今の単語数で練習した記録だけを比べます。単語数が違う記録（編集前の記録や、単語数を保存していない古い記録）は「含めて表示」で順位に加えられます。今の単語数の記録が1件もないときは、すべての記録で順位を付けます。練習画面の結果・ベスト記録、「練習記録」のベストの印、ホームも同じ基準です。

### 単語リスト

サイドバーの「単語リスト」では、保存した単語リストを1行ずつ、単語の例・単語数・練習回数・最終練習日とともに表示します。リスト名と単語で検索でき、追加した順（新しい順）・最近練習した順・名前順・単語が多い順に並べ替えられます。各行の「編集」で編集画面を開き、「…」から練習・ベスト記録・練習記録・CSVエクスポート・複製・削除を選べます。複製は単語だけを写した「（コピー）」を作り、練習記録は写しません。リストは100件まで保存できます。

編集画面は `/edit?list=<id>` で開くため、再読み込みやブラウザーの戻るでも一覧と行き来できます。保存していない変更があるときは、キャンセル・戻る・タブを閉じる前に確認します。単語数を変えると、それまでの記録は残りますがベスト記録の順位に含まれなくなるため、保存バーで案内します。

### 単語リストのCSVエクスポート

「単語リスト」の各リストの「…」から「CSVエクスポート」で、input・display・annotationの3列をUTF-8（BOM付き）で保存できます。単語の順番・重複・空白・改行を保持し、練習記録は含みません。既存のCSV取り込みで再利用できます（取り込みは1 MiB以内・1,000単語まで）。保存済みの内容を出力します。

## Sentry エラー監視

Sentry の接続用環境変数・収集範囲・確認手順は [docs/sentry.md](docs/sentry.md) を参照してください。
