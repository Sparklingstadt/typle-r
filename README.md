# Typle

自分の単語リストで練習できるタイピングアプリです。

上部の「テーマ」からライト・ダーク・システムを選べます。初期設定はシステム（OSの外観に追従）です。選択はブラウザに保存され、再読み込みやページ移動後も維持されます。

## v0.10.0 — 国名193か国・LAN起動

国名193か国を追加し、LAN内の別端末からの練習・記録保存と `npm run dev:lan` に対応しました。

本番: https://typle-r-six.vercel.app

リポジトリ: https://github.com/Sparklingstadt/typle-r （非公開）

本番はGitHub認証とNeon DB、ローカル/LANは開発用アカウントとDocker DBを使用します。開発ログインは本番では無効です。

## Sparklingstadt private copy

`liyur-qie/typle-r` の履歴を保持した独立した非公開コピーです。

国名：中国語・国連加盟193か国を初期リストとDB seedに追加しています。表示・入力は中国語、補足はピンイン / 日本語です。提供ZIPの作成元データを保持し、既存リスト・練習記録を上書きしません。

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

Node.js 22.12以上の22系、または24以上、npm、Docker Composeを使用します。

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

対象DBの環境変数を使って `npm run db:migrate` を実行してからデプロイします。DockerのDBからNeonへのデータコピーは自動ではありません。必要な場合はバックアップと復元を別途行います。本番への反映は検証済みのコミットからVercel CLIで行います。

公式資料: [Auth.js GitHub](https://authjs.dev/getting-started/providers/github)、[Prisma](https://www.prisma.io/docs/orm/v7)、[PostgreSQL Docker image](https://hub.docker.com/_/postgres)。

## 保存とアクセス制御

`typle_workspaces` テーブルにユーザーごとのJSONBスナップショットとrevisionを保持します。所有者はサーバーがAuth.jsセッションのGitHubユーザーIDから決定します。APIは未認証アクセスを拒否し、書き込みでOrigin、アカウント一致、形式、最大1MiBのサイズを検証します。共有ランキングはありません。

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

単体テストは入力判定、記録、移行、形式検証と実PostgreSQL上のPrismaクエリを検証します。E2Eは上限2 workersでファイル内も並列実行します。テストごとにランダムなアカウントIDを使用します。本番ビルドをポート3101で起動し、実PostgreSQLとAPIを通して作成・編集・練習・再読み込み・削除、アカウント分離、401/403/409応答を確認します。テスト専用秘密値で署名したセッションを使うため、GitHub OAuth画面の実ログインは別途確認が必要です。テストユーザーの行だけを終了後に削除します。

元リポジトリではGitHub ActionsのCIを停止していました。この独立コピーにはCI定義を引き継いでいます。開発ビルド `.next` と本番ビルド `.next-production` は分離しています。

## リリース

バージョンを更新し検証後、Git/SSHでコミットとタグをpush、GitHub CLIでリリースを作成します。`vercel.json` の `git.deploymentEnabled=false` でGit連携の自動デプロイを停止し、承認されたリリースをVercel CLIから明示的にデプロイします。

## 依存関係の監査

2026-09-06の更新時点で `npm audit` の指摘は0件です。Prisma 7.10の開発ツールが固定する依存に対し、`@prisma/config` のdeepmerge-tsを8.0.2、Prisma内のmysql2を3.24.3へ限定的にoverrideしています。Prismaの生成・マイグレーション・実DBテストを確認済みです。Prisma本体が修正版を採用したらoverrideを見直してください。

## UIコンポーネント

UIはshadcn/ui（Radix / Nova）とTailwind CSS 4で構成しています。設定は `components.json`、テーマは `src/app/globals.css`、コンポーネントのソースは `src/components/ui` にあります。追加は `npx shadcn@latest add <component>` で行えます。ボタンの既定typeはフォームの誤送信を避けるため `button`、標準の高さは44pxに調整しています。

削除確認はAlertDialogを使い、失敗時はダイアログ内で再試行できます。入力欄のラベル・必須属性、IME入力、認証とDB保存は維持しています。

### 国名データの出典・検証

[提供されたZIP](https://chatgpt.com/library/share/libfile_e75c8143a78c8191804af85bfd9d46a9?account_id=personal)と同じファイルの生成データ193行を利用しています。中国語名・拼音・日本語名は元資料の表記を維持しています。`tests/countries.test.cjs` で元データとのSHA-256一致と193件の重複なしを検証します。

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

`input` と `display` は見出し・各行の値とも必須です。`annotation` はカラム自体も値も省略できます。見出しの順番は自由で、その他のカラム名・重複した見出しはエラーになります。TSVではタブで区切ります。引用符で囲ったカンマ・タブ・改行、二重引用符のエスケープ（`""`）、UTF-8 BOMに対応します。ファイル上限は1 MiB、単語数は1リスト1,000件です。
