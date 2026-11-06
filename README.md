# Typle

自分の単語リストで練習できるタイピングアプリです。

練習画面（`/play`）の「思い出して打つ」を入れると、答えを隠して練習します。補足は答えを伏せて表示し（「apple / りんご」なら「りんご」だけ、区切りのない補足では答えを「＿＿」にします）、表示する単語が入力する文字と違うときはそれも出します（どちらもないときは「ヒントがありません」）。答えは未入力の文字数だけ「＿」で示します。次の単語・すべての単語・入力する文字の案内・簡易入力の対応は表示しません。「答えを見る」で答えを表示でき、その単語の残りの文字は1回だけミスに数えます。選んだモードはブラウザーごとに保存され、練習の途中では切り替えられません。この練習の記録は `mode: "recall"` を持ち、ベストと順位では通常の記録と分けて比べます（ベスト記録ページは「通常／思い出す」で切り替え、`?mode=recall`）。ダッシュボードは通常の記録だけを使います。

- 本番: https://typle.sparklingstadt.com （v2.33.0 から。`https://typle-r-six.vercel.app` のページはここへ移ります）
- リポジトリ: https://github.com/Sparklingstadt/typle-r （公開）

本番はGitHub認証とNeon DB、ローカル/LANは開発用アカウントとDocker DBを使用します。開発ログインは本番では無効です。

## 文書

| 文書 | 内容 |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | バージョンごとの変更（v2.1.3 まで。以降は [GitHub Releases](https://github.com/Sparklingstadt/typle-r/releases)） |
| [docs/features.md](docs/features.md) | 画面ごとの機能の仕様（ログインなしでの利用・表示言語・入力・ダッシュボード・単語リスト・CSV・端末・ベスト記録など） |
| [docs/word-list-sources.md](docs/word-list-sources.md) | 公式の単語リスト（国名・コマンド・構文）の出典と検証 |
| [docs/release-workflow.md](docs/release-workflow.md) | PR から本番公開までの手順 |
| [api-docs/](api-docs/src/README.md) | アプリの API の仕様（VuePress。`cd api-docs && npm ci && npm run docs:dev`） |
| [docs/sentry.md](docs/sentry.md) | Sentry のエラー監視 |
| [docs/design/](docs/design) | 画面ごとのデザインレビュー |
| [docs/roadmap.md](docs/roadmap.md) | これからの進め方（今・次・その先の順番と理由） |
| [docs/refactoring-roadmap.md](docs/refactoring-roadmap.md) | リファクタリングのロードマップ（負債の棚卸しと直す順番） |

## 関連リポジトリ

| リポジトリ | 内容 |
|---|---|
| typle-r（このリポジトリ） | Web 版（Next.js）、Go のバックエンドと API（`server/`） |
| [typle-ipad](https://github.com/Sparklingstadt/typle-ipad) | iPad 版と Mac 版（SwiftUI）。同じコードを1つのプロジェクトでビルドします |
| [typle-macos](https://github.com/Sparklingstadt/typle-macos)（旧 typle-m） | Mac 版。v2.6.11 で typle-ipad にまとめてアーカイブしました |
| [typle-w](https://github.com/Sparklingstadt/typle-w) | Windows 11 版（C#・WinUI 3）。v2.6.9 でアーカイブし、開発を止めました |
| [typle-a](https://github.com/Sparklingstadt/typle-a) | Android タブレット版（Kotlin・Jetpack Compose）。v2.6.9 でアーカイブし、開発を止めました |
| [typle-kotlin-backend](https://github.com/Sparklingstadt/typle-kotlin-backend) | Go のバックエンドと同じ API の Kotlin（Ktor）版。v2.6.10 でアーカイブし、`TYPLE_BACKEND=kotlin` の切り替えも外しました |

どのアプリも、このリポジトリの Go のバックエンドに同じ GitHub ログインでつなぎます。Web は `https://typle.sparklingstadt.com`、iPad・Mac 版は `https://typle-r-six.vercel.app` の `/api/*` を呼びます。Vercel のドメインで始めたログイン（`/api/auth/signin`）は、OAuth の cookie とコールバックを同じホストにするため、`vercel.json` で本番のドメインへ移します（`tests/domainRedirect.test.cjs`）。ほかのリポジトリは、このリポジトリのコードやデータの写しや対応する実装を持っています。ここを変えたら、合わせて直してください。

- 公式の単語リスト（`src/plugins/packs`）：`commands/` の各 JSON が1リストです。並び順の原本は `commands/manifest.json` です。追加・削除時は JSON と manifest を更新して `npm run packs:generate` を実行すると、Web が読み込む `commands/index.ts` と Go の埋め込み用コピー（`server/internal/workspace/packs`）を生成します（v1.5.0 から。`go generate ./server/internal/workspace` も同じスクリプトを実行します）。生成し忘れは単体テストで分かります。以前の `commands.json` 形式を使う他アプリには、`commands/manifest.json` の順に各 JSON を配列へまとめて渡してください。
- iPad 版と Mac 版：typle-ipad の `TypleCore/` は `src/core` の規則の Swift 版で、`catalog.json` は公式の単語リストから作った写しです。公式の単語リストを変えたら、typle-ipad で `node scripts/catalog.cjs ../typle-r` を実行して作り直します。
- ログイン（`client=ipad|macos|android|windows`）とトークンの形：各アプリが使うので、互換を保ちます。アーカイブした Android 版・Windows 版も、入っているアプリがそのままログインできるよう `android`・`windows` を受け付け続けます。
- アーカイブした typle-macos・typle-w・typle-a・typle-kotlin-backend は、このリポジトリを変えても直しません。

## 開発環境のセットアップ

### Dockerでの仮運用

Node.js 24（`package.json` の `engines` で24系に固定）、npm、Go 1.25以上、Docker Composeを使用します。

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

`npm run dev` は2つのプロセスを起動します。Go のバックエンド（`go run ./server/cmd/typle-web`、`127.0.0.1:8081`）と `next dev`（`127.0.0.1:3000`）で、どちらかが止まるともう片方も止めます。`go` コマンドがないときは、メッセージを出して終了します。バックエンドは `.env.local` の値を使い、起動のたびにコンパイルするため、初回は少し時間がかかります。`npm run dev:local`・`npm run dev:lan` も同じです。`TYPLE_WEB_URL` を設定すると、`next.config.mjs` の転送先と、バックエンドの待受（その URL のホストとポート）の両方がそこに変わります。バックエンドは HTTP だけで待ち受けるため、`TYPLE_WEB_URL` が `https://` の URL なら起動せずにメッセージを出して終了します。DB に接続できなくても起動し、その間 `/api/workspace`・`/api/health` は 503（`databaseUnavailable`）を返しますが、ログインは使えます。GitHub のログインは `AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET` が揃っているときだけ使え、揃っていなければ `/api/auth/signin` だけが 503 になります（開発ログインだけで開発できます）。

[ローカルアプリ](http://localhost:3000) を開いてGitHubでログインします。通常の停止は `docker compose --env-file .env.local stop`、再開は `up -d --wait` です。`down -v` は保存データを削除するため使用しないでください。

### 開発用ログインで起動

```sh
npm run dev:local
```

http://localhost:3000/local-login を開き「練習を始める」を押します。このMacのチェックアウトの `.env.local` は設定済みです。新規クローンでは上記のセットアップ後、`.env.local` に `LOCAL_DEVELOPMENT_LOGIN=1` を設定してください。DBは `docker compose --env-file .env.local up -d --wait` で再開できます。

開発ログインは `NODE_ENV=development`、`LOCAL_DEVELOPMENT_LOGIN=1`、`AUTH_URL` がHTTPのloopbackまたは明示指定したLAN内IPv4、`AUTH_SECRET` 設定済みのすべてを満たす場合だけ有効です。専用アカウント `github:0` を使用し、GitHubアカウントとは分離します。本番ビルドでは無効です。GitHub OAuthを使用する場合は `LOCAL_DEVELOPMENT_LOGIN=0` とし、従来どおりOAuthの設定を行ってください。

### LAN内の別端末から利用

`.env.local` の `AUTH_URL` を `http://<このMacのLAN IP>:3000`、`LOCAL_DEVELOPMENT_LAN_HOST` を同じIPに設定し、`npm run dev:lan` で起動します。別端末から同じURLの `/local-login` を開いてください。LAN用の開発ログインは明示指定したプライベートIPv4に限って有効で、本番では無効です。接続できるLAN内の利用者は、同じローカル練習用データを利用できます。DBポートは引き続きloopbackのみで待ち受けます。

`dev:lan` は `.env.local` のLANアドレスと `AUTH_URL` のポートを使用します。IPアドレスが変わった場合はこの2設定を更新してください。

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

Goのバックエンドと API はリポジトリ直下で `gofmt -l .`・`go vet ./...`・`GOTOOLCHAIN=go1.25.0 go run honnef.co/go/tools/cmd/staticcheck@v0.7.0 ./...`・`go test ./...` を実行します。ログインの Cookie、GitHub の OAuth（`httptest` で作った偽の GitHub を相手にします）、`/api/workspace`（検証・`revision` の競合・`409`）、iPad・Mac・Android・Windows のログイン（コード・トークン・Bearer）、セキュリティヘッダーなど、`server/internal/web` のハンドラーのテストも含みます。マイグレーション済みのテスト用DBを `TYPLE_TEST_DATABASE_URL` で指定すると、DBの読み書きも確かめます（CIの `verify` は `db:migrate` の後に実行します）。

`npm test` は入力判定、記録、移行、形式検証などの単体テストです。速さのため全ファイルを1つのプロセスで動かす（`--test-isolation=none`）ので、`process.env` や `globalThis` を変えるテストは終わりに元へ戻してください。E2Eは上限2 workersでファイル内も並列実行します。テストごとにランダムなアカウントIDを使用します。Playwright が Go のバックエンド（`go run ./server/cmd/typle-web`、ポート8081）と、本番ビルドの `next start`（ポート3101）を両方起動し、実PostgreSQLとAPIを通して作成・編集・練習・再読み込み・削除、アカウント分離、401/403/409応答を確認します。GitHub にはつながず、`tests/e2e/sessionCookie.ts` がテスト専用の秘密値で署名したログインの Cookie を作ります（Go の `server/internal/session` と同じ値になることは `tests/sessionCookie.test.cjs` が確かめます）。GitHub OAuth画面の実ログインは自動テストできないため、公開後に本番で別途確認が必要です。テストユーザーの行だけを終了後に削除します。

元リポジトリではGitHub ActionsのCIを停止していました。この独立コピーにはCI定義を引き継いでいます。開発ビルド `.next` と本番ビルド `.next-production` は分離しています。

## コードの構成

Next.js のアプリは1つで、`src` を層に分けています。依存は上から下への一方向だけで、`eslint.config.mjs` が `src/core`・`src/plugins` からの逆向きの import をエラーにします。画面（`src/app`・`src/components`）は保存先プラグインを直接 import できず、ワークスペースと保存場所（`storage`：`browser` / `account`）は `useWordLists()` から受け取ります。

| 層 | 場所 | 内容 |
|---|---|---|
| 画面 | `src/app`・`src/components`・`src/i18n`・`src/lib` | ページ、UI、多言語化、React のフック。`useWordLists` は React の状態とブラウザーのイベント（フォーカス・他タブの変更）だけを受け持ち、読み込み・保存は core の `createWorkspaceSession` に任せます |
| プラグイン | `src/plugins` | core のポートの実装と初期データ。`storage`：`cloud`（Goのバックエンドが提供する `/api/workspace`）と `guest`（LocalStorage）を `workspaceStore(accountId)` がアカウントに応じて選びます。`formats`：CSV・TSV（`delimited.ts`）と旧バージョンのブラウザー保存からの移行（`legacy.ts`）。`packs`：最初に表示する単語リスト（v0.85.0 から sparklingstadt アカウントの67リストのコピーで、`commands/` に1リスト1ファイルで保存しています。それまではサンプル、国名193か国、コマンドと構文の25種類を初級・中級・上級に分けた85リスト） |
| core | `src/core` | React・Next.js・ブラウザーAPIに依存しない TypeScript。単語リスト・入力判定・記録・集計・ワークスペースのモデルと検証、保存先のポート `WorkspaceStore`（`workspaceStore.ts`、保存場所 `location` を含む）、ワークスペースの読み込み・保存 `createWorkspaceSession`（`workspaceSession.ts`。アカウントの切り替え後に届いた結果の破棄、保存の直列化、409での再読み込み、古いクラウド読み込みの無視）とファイル形式のポート `WordFormat`（`wordFormat.ts`） |

保存先を増やすときは `WorkspaceStore` を実装したプラグインを `src/plugins/storage` に追加し、`workspaceStore` で選びます。ファイル形式を増やすときは `WordFormat` を実装して `src/plugins/formats/index.ts` の一覧に加えると、取り込みの拡張子判定と `accept` に反映されます。どちらも画面のコードは変わりません。

バックエンド（`server/`）はNext.jsとは独立したGoのコードで、モジュールはリポジトリ直下の `go.mod` です。`internal/store` が DB を読み書きし、`internal/workspace` がアプリの `decodeLists`・`decodeDevices` と同じ規則で検証します。標準ライブラリ以外の主な依存は、PostgreSQLのドライバー（pgx）、名前を日本語の照合で並べる `golang.org/x/text`、エラー報告の `sentry-go`、GraphQL の gqlgen です。

Next.js の `/api` は使いません。

| 場所 | 内容 |
|---|---|
| `server/internal/web` | GitHub ログイン（`/api/auth/session`・`signin`・`signout`（`?everywhere=1` ですべての端末から）・`callback/github`、アプリ用の `token`）、`/api/workspace`（読み込みと、`revision` による保存）、`/api/shares`・`/api/shared`、単語パックのギャラリー（`/api/gallery`・`/api/gallery/categories`・`/api/gallery/added`・`/api/gallery/reports`。ログイン不要で、すべての応答に `X-Robots-Tag: noindex`）、`/api/health` を1つの `http.Handler` にまとめます。通報と追加数の連打は、IP ごとの回数制限で抑えます（「ギャラリーのレート制限」を参照）。すべての応答に、`next.config.mjs` と同じ4つのセキュリティヘッダー（`Content-Security-Policy`・`X-Frame-Options`・`X-Content-Type-Options`・`Referrer-Policy`）を付けます。ローカル開発のログイン（`POST /api/auth/local`）もここにあり、`typle-web` でだけ有効です |
| `server/internal/session` | ログインの Cookie（`HttpOnly`・`SameSite=Lax`・ログインから30日で失効・延長なし）と、iPad・Android・Windows のログインのコード・トークンの署名と検証です。値は `AUTH_SECRET` から導いた鍵（種類ごとに別）で HMAC-SHA256 署名します。名前は `AUTH_URL` が HTTPS なら `__Host-typle-session`、HTTP なら `typle-session` です |
| `server/internal/auth` | ログインの GitHub OAuth クライアント（認可コードと PKCE）と FFPF ID のクライアントです |
| `server/vercel` | `web` のハンドラーを Vercel の Go の関数として呼ぶ橋渡しです。リポジトリ直下の `api/index.go`（Vercel の Go の関数は1つだけで、`vercel.json` の `rewrites` がバックエンドのパスをすべてここへ送ります）がこれを呼びます。`/api/health` と、ログイン不要の `/api/shared`・`GET /api/gallery`・`GET /api/gallery/categories` は、ログインの設定（`AUTH_SECRET`・`AUTH_URL`）がなくても DB だけで答えます。`POST /api/gallery/added` と `POST /api/gallery/reports` は `Origin` を確かめるため、`/api/shares` と同じく設定がなければ 503（`authUnavailable`）を返します。`/api/workspace` は、ログインの設定がなければ DB を開かずに 503（`authUnavailable`）を返します |
| `server/cmd/typle-web` | `web` のハンドラーを手元で起動します（既定 `127.0.0.1:8081`）。`npm run dev` と E2E が使います |
| `server/internal/serve` | `typle-web` の待受です。止めるとき（SIGINT・SIGTERM）は、処理中のリクエストが終わるまで最大5秒待ってから DB を閉じます |

### iPad と Mac と Android と Windows のログイン

Android 版（typle-a）と Windows 版（typle-w）は v2.6.9 でアーカイブしました。サーバーは今も `client=android`・`windows` を受け付けます。この節の Android・Windows の動作は、アーカイブした時点のものです。

iPad アプリと Mac アプリ（どちらも [typle-ipad](https://github.com/Sparklingstadt/typle-ipad) リポジトリ）・Android アプリ（[typle-a](https://github.com/Sparklingstadt/typle-a) リポジトリ）・Windows アプリ（[typle-w](https://github.com/Sparklingstadt/typle-w) リポジトリ）は、Web版と同じ GitHub OAuth App でログインし、Cookie の代わりにトークンを使います（RFC 8252 のネイティブアプリの形）。サーバーの側は `client` が `ipad`・`macos`・`android`・`windows` のどれかだけが違い、流れは同じです。

1. アプリが32バイトの乱数から検証値（verifier）を作り、システムのログイン画面（iPad と Mac は `ASWebAuthenticationSession`、Android は Custom Tabs、Windows は既定のブラウザー）で `/api/auth/signin?client=<ipad|macos|android|windows>&code_challenge=<S256>` を開きます。チャレンジは OAuth の Cookie に入り、GitHub にはサーバー自身の PKCE を使います。
2. `callback/github` は Cookie を発行せず、`typle-r://login?code=<コード>` へリダイレクトします。コードはユーザーとチャレンジに署名したもので、2分で切れます。失敗・キャンセルは `typle-r://login?error=loginFailed` です。Android は `MainActivity` の intent-filter（scheme `typle-r`・host `login`）で、Windows は起動のたびに登録するプロトコル（`typle-r`、この Windows ユーザーの `HKEY_CURRENT_USER`）でこの URL を受け取ります。Windows では、ブラウザーが開いた2つ目の Typle が、動いている Typle にこの URL を渡して終わります。アプリを離れてコールバックが来なかったときは、何も起きなかったものとして戻ります（Windows は「ログインをやめる」で待つのをやめます）。
3. アプリが `POST /api/auth/token`（`{"code","verifier"}`）を呼び、検証値の SHA-256 がチャレンジと一致すれば `{"token","user"}` を返します。コードを横取りしても、検証値がなければトークンにできません。間違いはすべて `400 loginFailed` です。Android と Windows は、ログインを始めてから10分たったログイン途中の状態は無効とし、ログインに失敗したものとして扱います。
4. アプリは `Authorization: Bearer <トークン>` で `/api/auth/session` と `/api/workspace` を呼びます。トークンは Cookie と別の鍵で署名した、ログインから30日で切れる（延長しない）値で、Cookie の値をトークンとして、トークンを Cookie として使うことはできません。`Authorization` ヘッダーがある要求はトークンだけで判断し（Cookie は見ません）、ブラウザーが自動では付けないため、`PUT /api/workspace` の Origin の確認は要りません（`Content-Type` の確認は残ります）。
5. トークンは更新されません（v0.107.0 から。それまでは発行から24時間で `/api/auth/session` の応答の `token` で新しくなっていました）。切れたら `401` になるので、もう一度ログインします。ログアウトはアプリがトークンを消すだけですが、`POST /api/auth/signout?everywhere=1` を `Authorization: Bearer <トークン>` で呼ぶと、そのアカウントのすべての端末のログインを無効にできます（`typle_session_revocations`）。トークンは iPad と Mac では Keychain に、Android では Android Keystore の鍵で暗号化して、Windows では Windows のデータ保護（DPAPI）で暗号化して保存します。

Android のエミュレーターから手元の `npm run dev` で試すときは、サーバー URL に `http://10.0.2.2:<ポート>`（エミュレーターから見たホストの `localhost`）を入れます。ただし GitHub の OAuth App の callback URL は `AUTH_URL` に合わせたもの（`<AUTH_URL>/api/auth/callback/github`）でなければならず、開発用ログイン（`POST /api/auth/local`）はアプリでは使えません。

画面は `src/lib/session.tsx` の `useSession`・`signIn`・`signOut` で `/api/auth/*` を呼びます。ログイン状態は `/api/auth/session` の 200 の答えだけで決め、確認が失敗したとき（通信の失敗、200 以外の答え、読めない本文）は前の状態のままにします。最初の確認だけは 1・2・4 秒後にやり直し、すべて失敗したら未ログインとして扱います。手元と E2E では、`next.config.mjs` が `/api/workspace`・`/api/health`・`/api/auth/*` を `TYPLE_WEB_URL`（既定 `http://127.0.0.1:8081`）へ転送します。Vercel 上では転送せず、同じパスの Go の関数が応答します。エラーは `SENTRY_DSN`（なければ `NEXT_PUBLIC_SENTRY_DSN`）で Sentry に送ります（[docs/sentry.md](docs/sentry.md)）。

## 保存とアクセス制御

`typle_workspaces` テーブルにユーザーごとのJSONBスナップショットとrevisionを保持します。APIとログインはGoのバックエンド（`server/`）が提供し、所有者はサーバーがログインセッション（iPad はトークン）のGitHubユーザーIDから決定します。APIは未認証アクセスを拒否し、書き込みでOrigin（Cookie のとき）、アカウント一致、形式、最大1MiBのサイズを検証します。共有ランキングはありません。

次の段落は v2.0.0 より前の記録です（v2.0.0 でホームの「以前のデータを移行」をなくしました）。

旧形式のキーは `typle-r:word-lists:v1`、値は `{ version: 1, lists: [...] }` です。ホームの移行ボタンは現在のアカウントに追加し、同じ内容の再移行を重複させません。同名のリストは名前に移行番号を付けます。壊れた元データは変更しません。リスト削除はその記録も削除します。

## 本番の構成

### Neon / Vercelの構成

Vercel MarketplaceでNeonを接続し、サーバー用の環境変数を設定します。

- `DATABASE_URL`: NeonのPostgreSQL接続URL（pooled接続可、`POSTGRES_URL`も代替として利用可能）
- `DIRECT_URL`: マイグレーション用の直接接続URL（任意、未指定時はDATABASE_URL）。DATABASE_DRIVERは不要です。
- `AUTH_SECRET`: 暗号学的にランダムな秘密値
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`: 本番用OAuth Appの認証情報
- `AUTH_URL`: 本番URL。本番OAuth callbackは `<本番URL>/api/auth/callback/github`（v0.55.0 でも変わりません）。Go はこの値のオリジンだけを使います
- `FFPF_ID_ISSUER`, `FFPF_ID_CLIENT_ID`, `FFPF_ID_CLIENT_SECRET`: FFPF ID（ffpf-portal）の issuer とクライアントの認証情報（任意。3つ揃えたときだけ FFPF ID のログインと `/admin` を使えます）。portal に登録する redirect URI は `<本番URL>/api/auth/callback/ffpf` です

Go の関数（`api/index.go`）も同じ環境変数を読むため、Vercel の設定は増やしません。対象DBの環境変数を使って `npm run db:migrate` を実行してからデプロイします。マイグレーションは `db/migrations` の SQL で、`scripts/migrate.cjs` が `pg` で適用します（v2.36.19 から Prisma は使いません。アプリの DB の読み書きは Go の pgx）。DockerのDBからNeonへのデータコピーは自動ではありません。必要な場合はバックアップと復元を別途行います。本番への反映は検証済みのコミットからGitHub Actions内のVercel CLIで行います。

公式資料: [GitHub OAuth App](https://docs.github.com/ja/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[PostgreSQL Docker image](https://hub.docker.com/_/postgres)。

### ギャラリーのレート制限

ログインなしで書き込める2つのAPIは、Go のコードで IP ごとに回数を制限します。

| 対象のパス（`POST`） | 上限 | 単位 | 超えたとき |
|---|---|---|---|
| `/api/gallery/reports` | 1分あたり10リクエスト | クライアントのIPごと | `429 tooManyRequests` と `Retry-After`（窓が終わるまでの秒数。1以上）。通報は記録しません |
| `/api/gallery/added` | 1分あたり60リクエスト | クライアントのIPごと | 同上。追加数は変えません |

- 数える窓は1分ごとの固定窓で、回数は DB の `typle_gallery_hits` に持ちます（関数のインスタンスをまたいで数えるため）。`Origin` や `Content-Type`、本文が不正で先に断る要求は数えません。アプリのトークン付きの要求も同じく IP で数えます。
- DB に保存するのは IP そのものではなく、`AUTH_SECRET` から専用に導いた鍵での IP の HMAC-SHA256（先頭16バイト）です。10分より古い行は、次の回数の更新のときに消します。通報とは結び付けず、数えるためにだけ使います。
- 数えられなかったとき（DB の失敗）は、制限なしで通さず `503 databaseUnavailable` にします。
- IP の決め方：Vercel の関数（`server/vercel` が組み立てるとき）では、`X-Vercel-Forwarded-For`、`X-Forwarded-For`、`X-Real-Ip` の順に、最初の値（カンマ区切りの先頭）が IP アドレスとして読めるものを使います。読めるものがなければ、共通の「不明」のクライアントとして数え（制限は外れません）、Sentry に `gallery.limit.ip` を報告します。Vercel 以外（ローカルの `typle-web` やテスト）では、クライアントが自由に書ける転送ヘッダーを無視し、接続元のアドレスのホスト部分だけを使います。
- Vercel Firewall の Rate Limiting は、現在のプランでは使えません（設定しようとすると 402 になります）。そのため、この制限はコードで行います。

### FFPF ID でのログインの設定

FFPF ID（ffpf-portal）は、GitHub と並ぶもう1つのログイン方法です。次の3つの環境変数がすべて設定されているときだけ有効になります（1〜2個だけだと警告を1回ログに書いて無効のままです）。

| 環境変数 | 内容 |
|---|---|
| `FFPF_ID_ISSUER` | ffpf-portal の issuer（`https://…`。末尾の `/` は付けても外されます） |
| `FFPF_ID_CLIENT_ID` | portal に登録したクライアントの ID |
| `FFPF_ID_CLIENT_SECRET` | そのクライアントのシークレット |

- portal に登録する redirect URI は `<AUTH_URL のオリジン>/api/auth/callback/ffpf` です（本番は `https://typle.sparklingstadt.com/api/auth/callback/ffpf`）。portal は redirect URI が登録と完全に一致しないと拒否します。
- クライアントの登録（client_id・シークレットの作成と redirect URI の登録）は ffpf-portal 側の作業です。手順は ffpf-portal の README と、`docs/superpowers/specs/2026-10-27-ffpf-id-design.md` の「クライアント」を見てください。
- `.env.example` に3つの変数を載せています。ローカルで試すときは `.env.local` に書きます。Vercel では「Neon / Vercelの構成」の環境変数に足します。
- ログインした利用者は GitHub のアカウントとは別のアカウントです（アカウント ID は `ffpf:` で始まります）。
- portal にログインしたままのブラウザでは、FFPF ID のログインはパスワードを聞かずに通ります（SSO）。ただし typle-r でログアウト（`/api/auth/signout`・`/api/auth/admin/signout`）したブラウザには Cookie `typle-ffpf-relogin`（`/api/auth`、30日）を置き、次の FFPF ID のログインに `prompt=login` を付けて portal のログイン画面を出させます。FFPF ID でログインし終えると消します。アプリ（iPad など）のログアウトでは置きません。

### 管理者ダッシュボード（/admin）

`/admin` には FFPF ID でだけログインできます（`GET /api/auth/signin?admin=1`、`provider` の値にかかわらず FFPF ID へ進み、コールバックは `/api/auth/callback/ffpf`）。GitHub でのログインでは管理者になれません。

- 使うには FFPF ID の設定（`FFPF_ID_ISSUER`・`FFPF_ID_CLIENT_ID`・`FFPF_ID_CLIENT_SECRET`）が必要です。揃っていなければ、管理者のログインは 503（`authUnavailable`）になります。
- ログインの最後に `typle_admins` を確かめ、登録されたメールアドレスのときだけ管理者用 Cookie（`__Host-typle-admin`、SameSite=Strict、12時間で失効・延長なし）を発行して `/admin` に戻ります。登録されていないアカウントは `/admin?error=adminForbidden`、DB に届かないときは `/admin?error=adminUnavailable` に戻り、何にもログインしません。管理者のログインは通常のセッション Cookie を発行しません。
- FFPF ID の `sub` は最初のログインで記録し、以後は同じ `sub` だけを通します（メールアドレスを引き継いだ別人を通さないため）。`GET /api/admin/*` も毎回この表を確かめ、行がなければ `403 adminForbidden` で Cookie を消します。
- 「ギャラリー」の欄には、掲載中か非公開の共有を通報の多い順に最大100件並べ、通報の件数と理由ごとの件数を出します。「非公開にする」「戻す」は `POST /api/admin/gallery/hide`・`unhide` です（`Content-Type: application/json` とアプリの `Origin` が必要）。非公開にした共有は、ギャラリーからも `/api/shared` からも消えます。

管理者は、リポジトリには書かず、対象の DB に SQL で登録します。1人につき1行で、メールアドレスは FFPF ID に登録したものを小文字で書きます。

```sql
INSERT INTO typle_admins (email) VALUES ('<FFPF IDのメールアドレス>');
```

管理者をやめるときは、その行を `DELETE FROM typle_admins WHERE email = '<メールアドレス>';` で消します。

### Sentry エラー監視

Sentry の接続用環境変数・収集範囲・確認手順は [docs/sentry.md](docs/sentry.md) を参照してください。

## リリース

必須の順序は **PR作成 → マージ（squash merge か普通のマージ） → マージ後のverify → GitHub Release作成 → Vercel本番デプロイ** です。`package.json` と `package-lock.json` のバージョンをPR内で更新します。mainへの直接push、手動タグ・Release作成、手動デプロイは行いません。`vercel.json` の `git.deploymentEnabled=false` は維持し、GitHub ActionsがReleaseとデプロイを順番に実行します。初回設定・Secrets・復旧手順は [リリース運用](docs/release-workflow.md) を参照してください。

## UIコンポーネント

UIはshadcn/ui（Radix / Nova）とTailwind CSS 4で構成しています。設定は `components.json`、テーマは `src/app/globals.css`、コンポーネントのソースは `src/components/ui` にあります。追加は `npx shadcn@latest add <component>` で行えます。ボタンの既定typeはフォームの誤送信を避けるため `button`、標準の高さは44pxに調整しています。

削除確認はAlertDialogを使い、失敗時はダイアログ内で再試行できます。入力欄のラベル・必須属性、IME入力、認証とDB保存は維持しています。

Tailwind 4の対象ブラウザーはSafari 16.4以上、Chrome 111以上、Firefox 128以上です（v0.5.0 から）。

## 依存関係の監査

2026-11-06 の `npm audit` の指摘は13件（low 2・moderate 11）で、どれも開発用の ESLint と shadcn の依存（`minimatch`・`deepmerge`）です。本番の依存には入っていません。v2.36.19 で Prisma をなくし、そのための override もなくなりました。

## リポジトリの経緯

`liyur-qie/typle-r` の履歴を保持した独立したコピーです。2026年11月から公開しています。
