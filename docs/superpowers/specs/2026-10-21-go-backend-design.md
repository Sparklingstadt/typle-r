# アプリのバックエンドを Go にする 設計

- 日付: 2026-10-21
- 対象バージョン: v0.54.0（Go を Vercel で動かす確認）、v0.55.0（ログインと `/api/workspace` の切り替え）

## 目的

アプリ本体のバックエンド（GitHub ログインと `/api/workspace`）を Next.js（Auth.js・Prisma）から Go に移し、既にある Go API（`server/`）とサーバー側のコードを Go にまとめる。画面の内容と保存データ（`typle_workspaces`）の形は変えない。

## 成功の条件

- 本番で、ログイン・ログアウト・保存・読み込みが今と同じように動く。
- Next.js に API ルート（`src/app/api/`）と `next-auth` が残っていない。実行時の Prisma クライアントも使わない（Prisma はマイグレーションのためだけに残す）。
- 今の CI の流れ（PR → squash merge → verify → GitHub Release → Vercel 本番デプロイ）のまま公開できる。

## 決定事項

| 項目 | 決定 |
|---|---|
| 移す範囲 | GitHub ログイン（OAuth）・セッション・`/api/workspace`。ローカル開発のログインも含む |
| 動かす場所 | 同じ Vercel プロジェクト。リポジトリ直下の `api/*.go` を Go の関数として動かす |
| 今のセッション | 引き継がない。切り替え時に一度だけログインし直してもらう（保存データはサーバーにあるので消えない） |
| `/api/v1` | 本番に載せない。今まで通り `cmd/typle-api` を手元で起動して使う |
| 進め方 | 2 回に分けて出す。1 回目で Vercel 上で Go が動くことを確かめ、2 回目で切り替える |

## 範囲外

- `/api/v1` の本番公開
- Auth.js のセッション Cookie の読み取り（引き継ぎ）
- 画面の見た目・文言の変更（ログインに失敗したときの専用の表示も作らない）
- DB のスキーマの変更

## 背景（今の構成で設計に効くこと）

- `vercel.json` の `git.deploymentEnabled: false` のため、CI は本番にしかデプロイせず、プレビューで確かめられない。そのため、影響のない Go 関数を先に本番へ出して確かめる。
- E2E とローカル開発は Next.js の `/api/*` を使っている。E2E は `next-auth/jwt` の `encode` で Cookie を作ってログインしている。
- 保存データがないとき、アプリの `/api/workspace` は空のリスト（`revision: 0`）を返す。Go の `store.Read` は最初の単語リストを返す。`/api/workspace` はアプリの答え方に合わせる。
- `.vercelignore` は `server` を丸ごと外している。

## 構成

### Go のコード

- `go.mod`・`go.sum` を `server/` からリポジトリ直下へ移し、モジュール名を `github.com/sparklingstadt/typle-r` にする。パッケージは `server/` に置いたままなので、import パス（`github.com/sparklingstadt/typle-r/server/internal/…`）は変わらない。
- 新しいパッケージ `server/internal/web` に、アプリ用のバックエンド（ログインと `/api/workspace`）を 1 つの `http.Handler` として作る。DB は `server/internal/store`、検証は `server/internal/workspace` を使う。
- 新しいコマンド `server/cmd/typle-web` が、`web` のハンドラーを手元で起動する（既定 `127.0.0.1:8081`）。
- `server/cmd/typle-api`（`/api/v1`）は変えない。

### Vercel での入口

`api/*.go` は 1 ファイルが 1 つの関数で、パスがそのまま URL になる。どれも `package handler` の `Handler` が `web` のハンドラーを呼ぶだけにする。

| ファイル | URL | 回 |
|---|---|---|
| `api/health.go` | `GET /api/health` | 1 回目 |
| `api/workspace.go` | `GET`・`PUT /api/workspace` | 2 回目 |
| `api/auth/session.go` | `GET /api/auth/session` | 2 回目 |
| `api/auth/signin.go` | `GET /api/auth/signin` | 2 回目 |
| `api/auth/signout.go` | `POST /api/auth/signout` | 2 回目 |
| `api/auth/callback/github.go` | `GET /api/auth/callback/github` | 2 回目 |

- コールバックの URL は今の Auth.js と同じなので、GitHub の OAuth App の設定は変えない。
- ローカル開発のログイン（`POST /api/auth/local`）は `typle-web` にだけ置き、`api/` には置かない。本番には存在しない。

### 手元と E2E

- `next.config.mjs` の rewrites で、`VERCEL` が `1` でないときだけ `/api/workspace`・`/api/health`・`/api/auth/:path*` を `typle-web`（既定 `http://127.0.0.1:8081`、`TYPLE_WEB_URL` で変更可）へ転送する。
- `npm run dev`・`npm run dev:lan` は、`typle-web` と `next dev` を一緒に起動し、どちらかが止まればもう片方も止める。
- 手元にも Go 1.25 以上が要る。

### Next.js から消すもの（2 回目）

- `src/app/api/`（`auth/[...nextauth]`・`workspace`・`_lib/session.ts`）
- `src/auth.ts`、`next-auth` パッケージ
- `src/plugins/storage/cloud/database.ts`・`repository.ts`・`databaseUrl.ts` と、それらだけが使う依存（`@prisma/adapter-pg`・`@prisma/client`・`pg` のうち実行時に不要になるもの。マイグレーションとテストで使うものは残す）

### 設定ファイル

- `.vercelignore`：`server` の代わりに `server/cmd` を外す（`server/internal` は関数のビルドに要る）。
- CI：Go のチェック（`gofmt -l`・`go vet ./...`・`go test ./...`）をリポジトリ直下で実行し、`setup-go` の `cache-dependency-path` を `go.sum` にする。

## `/api/health`（1 回目）

- `GET` だけ。DB に `SELECT 1` を送り、成功すれば `200 { "status": "ok" }`、失敗すれば `503 { "error": "databaseUnavailable" }`。それ以外の情報は返さない。
- Vercel 上の Go が Next.js と一緒に動くことと、本番 DB に TLS（`store.ConnString`）でつながることを確かめる。
- CI のデプロイ後の確認に、`/api/health` が 200 であることを足す。

## ログイン

### 流れ

1. 画面の「GitHub でログイン」は `/api/auth/signin?returnTo=<今のパス>` へ移動する。`returnTo` は `/` で始まり `//` と `/\` で始まらないパスだけ受け付け、それ以外は `/home` にする。
2. `signin` は、`state`（32 バイトの乱数）と PKCE の検証値（`code_verifier`）を作り、`returnTo` と一緒に署名付きの短命の Cookie（`typle-oauth`、10 分、`Path=/api/auth`）に入れて、GitHub の `https://github.com/login/oauth/authorize` へ送る（`client_id`・`redirect_uri`・`state`・`code_challenge`・`code_challenge_method=S256`。スコープなし）。
3. `callback/github` は、クエリの `state` と Cookie の `state` を照合し、`https://github.com/login/oauth/access_token` でコードをアクセストークンに交換する（`client_secret`・`code_verifier` を付ける）。
4. そのトークンで `https://api.github.com/user` を呼び、`id`・`name`（空なら `login`）・`avatar_url` を取る。アクセストークンは保存しない。
5. セッション Cookie を発行し、`typle-oauth` を消して `returnTo` へ戻す。

- ユーザーがキャンセルした（`error` が付いて戻った）、`state` が合わない、`typle-oauth` がない・期限切れのときは、ログインしないまま `returnTo`（分からなければ `/home`）へ戻す。
- GitHub への通信の失敗・想定外の応答は Sentry に送り（タグ `auth.callback`）、同じく `returnTo` へ戻す。

### セッション Cookie

- 名前：`AUTH_URL` が HTTPS なら `__Host-typle-session`、HTTP なら `typle-session`。
- 値：`base64url(JSON)` + `.` + `base64url(HMAC-SHA256)`。JSON は `{ "sub": "github:123", "name": "…", "image": "…", "iat": <秒>, "exp": <秒> }`。
- 鍵：`AUTH_SECRET` から HKDF-SHA256（info `typle session v1`）で導いた 32 バイト。`typle-oauth` の署名には info `typle oauth v1` で導いた別の鍵を使う。
- 属性：`HttpOnly`・`SameSite=Lax`・`Path=/`・HTTPS なら `Secure`。有効期限 30 日。
- 署名が合わない・期限切れ・`sub` が `^github:\d+$` に合わない Cookie は、ないものとして扱う。
- `GET /api/auth/session` を呼んだとき、`iat` から 24 時間以上たっていれば、同じ内容で `iat`・`exp` を更新した Cookie を発行し直す。

### エンドポイント

| エンドポイント | 内容 |
|---|---|
| `GET /api/auth/session` | `{ "user": { "id", "name", "image" } }`。未ログインは `{ "user": null }`。`Cache-Control: private, no-store` |
| `GET /api/auth/signin` | 上の流れの 1・2 |
| `GET /api/auth/callback/github` | 上の流れの 3〜5 |
| `POST /api/auth/signout` | Origin が `AUTH_URL` のオリジンと違えば `403 forbiddenRequest`。セッション Cookie を消して `204` |
| `POST /api/auth/local` | `typle-web` だけ。有効になる条件は今の `localDevelopmentEnabled` と同じ（`LOCAL_DEVELOPMENT_LOGIN=1`、`AUTH_SECRET` あり、`AUTH_URL` が HTTP の loopback か `LOCAL_DEVELOPMENT_LAN_HOST` と同じ私設 IPv4）。Origin を確かめ、`github:0`（名前「ローカル練習用」）のセッションを発行して `204`。無効なら `404 notFound` |

### 環境変数

`AUTH_SECRET`・`AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET`・`AUTH_URL` をそのまま使う。Vercel の設定は増やさない。`AUTH_SECRET`・`AUTH_URL`（ログインでは `AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET` も）がないときは、そのリクエストに `503` を返して理由をログに出す。

### 画面側

- `src/lib/session.tsx` に `SessionProvider`・`useSession`（`{ data, status, update }`）・`signIn()`・`signOut()` を作り、`next-auth/react` と同じ形にする。`useSession` は `/api/auth/session` を読む。
- `signIn()` は `/api/auth/signin?returnTo=<今のパス>` へ移動する。`signOut()` は `POST /api/auth/signout` の後に `/home` へ移動する。
- 使っている 6 か所（`AccountBar`・`AuthProvider`・`LegacyImport`・`StorageComparison`・`StorageBadge`・`useWordLists`）と `/local-login` を書き換える。`/local-login` はサーバーアクションをやめ、フォームから `POST /api/auth/local` を呼んでから `update()` する。

## `/api/workspace`

今の `src/app/api/workspace/route.ts` と同じ順で確かめ、同じステータスとエラーのキーを返す（キーは画面の翻訳と対応している）。応答には `Cache-Control: private, no-store` と `Vary: Cookie` を付ける。

### GET

- 未ログイン：`401 loginRequired`。
- 行がない：`{ "lists": [], "devices": [], "revision": 0, "accountId" }`。
- 行がある：`workspace.Decode` で読み、`{ "lists", "devices", "revision", "accountId" }`。
- DB の障害・読めない保存データ：`503 databaseUnavailable`（Sentry のタグ `workspace.read`）。

### PUT

| 順 | 確かめること | 応答 |
|---|---|---|
| 1 | Origin が `AUTH_URL` のオリジンと違う、または `Content-Type` の `;` より前が `application/json` でない | `403 forbiddenRequest` |
| 2 | 未ログイン | `401 loginRequired` |
| 3 | 本文が 1MiB を超える（読みながら数え、超えたら打ち切る） | `413 workspaceTooLarge` |
| 4 | JSON のオブジェクトでない | `400 invalidWorkspace` |
| 5 | `accountId` がセッションの `sub` と違う | `401 loginAccountChanged` |
| 6 | `revision` が 0 以上の安全な整数でない | `400 invalidWorkspace` |
| 7 | `profileId` が `default` 以外、または `profiles` がある | `409 conflict` |
| 8 | `lists`・`devices` が読めない、または上限（下記）を超える | `400 invalidWorkspace` |
| 9 | 書き込み時：`revision` が古い／`lists` の数が 100 を超え、かつ保存済みより多い（順は下の「書き込み」） | `409 conflict`／`400 listLimit` |
| 10 | そのほかの失敗 | `503 workspaceSaveFailed`（Sentry のタグ `workspace.write`） |

- 上限は `workspaceRequest.ts` と同じ：1 リストの単語 1000・記録 10000・名前 200 文字、単語の `input`・`display` 1000 文字、`annotation` 2000 文字（文字数は UTF-16 の単位で数える）。
- `lists`・`devices` は省略できる。省略した方は保存済みのまま。
- 検証は `workspace.Decode` と同じ規則で、知らない項目は残す。

### 書き込み

`internal/store` に `revision` を扱う読み書きを足す。`/api/v1` の `Modify`（行ロック方式）は変えない。

- `ReadRevision(owner)`：行と `revision` を返す。行がなければ「ない」と返す。
- `WriteRevision(owner, revision, change)`：
  - `revision == 0`：空の保存データに対してリストの数を確かめ（超えれば `listLimit`）、`INSERT … ON CONFLICT (owner_id) DO NOTHING RETURNING …`。挿入されなければ競合。
  - それ以外：保存済みを読み、行がないか `revision` が違えば競合。次にリストの数を確かめ（超えれば `listLimit`）、`UPDATE … WHERE owner_id = $1 AND revision = $2 RETURNING …`。0 行なら競合。
  - この順は今の `repository.ts`（`applyChange` の位置）と同じ。
- DB の接続は、関数のインスタンスごとに 1 つのプール（最大 5 接続）を作って使い回す。接続文字列は `DATABASE_URL`（なければ `POSTGRES_URL`）を `store.ConnString` に通す。

## Sentry（Go）

- `sentry-go` を使う。DSN は `SENTRY_DSN`、なければ `NEXT_PUBLIC_SENTRY_DSN`。どちらもなければ送らない。環境名は `SENTRY_ENVIRONMENT`。
- サーバーレスで送り損ねないよう、エラーを送ったリクエストは応答の前に `Flush`（最大 2 秒）する。
- 画面側の Sentry（`@sentry/nextjs`）は変えない。

## テスト

- Go の単体テスト：
  - セッション Cookie：発行・検証・改ざん・期限切れ・更新。TypeScript（E2E の補助）と同じテスト用の値で一致を確かめる。
  - OAuth：GitHub を `httptest` のサーバーに差し替え、成功・キャンセル・`state` の不一致・Cookie の期限切れ・GitHub の失敗。`returnTo` の検証。
  - `/api/workspace`：CI の一時 PostgreSQL で、上の表のすべてのステータスと、同時に保存したときの `409`。
  - 検証の一致：TypeScript の検証（`validateWorkspaceRequest`）のテストに使っている入力を Go にも通し、受け付ける・断るが一致することを確かめる。
- `tests/workspace.test.cjs`（Prisma のリポジトリのテスト）は Go に移して消す。
- E2E：Playwright の `webServer` で `typle-web`（8081）と `next start`（3101）を両方起動する。Cookie は Node の `crypto` で新しい形式のものを作る。`account.spec.ts` の確認（401・403・409・アカウントの分離・ログアウト）はそのまま通す。
- GitHub の実際の OAuth 画面は自動テストできないので、2 回目の公開後に本番で手動で確かめる。

## 公開

| 回 | バージョン | 内容 |
|---|---|---|
| 1 回目 | v0.54.0 | `go.mod` を直下へ、`api/health.go`、`web` のハンドラー（`/api/health` だけ）、`.vercelignore`、CI（Go のチェックの場所とデプロイ後の確認） |
| 2 回目 | v0.55.0 | ログイン・`/api/workspace`・`typle-web`・画面側・E2E・Sentry（Go）・ドキュメント。`next-auth`・Prisma クライアント・API ルートの削除 |

- 2 回目は、1 回目の本番デプロイで `/api/health` が 200 になったことを確かめてからマージする。
- 2 回目で本番が壊れたら、新しいバージョンで元に戻す PR を出す。手動のデプロイ・ロールバックはしない。
- ドキュメント：README（開発の始め方に Go が要ること、`npm run dev` の動き、OAuth の設定、テストの説明）、`docs/api.md`（起動の `cd server` が直下になる）、`docs/release-workflow.md`（デプロイ後の確認）。

## リスク

- Vercel が Next.js のプロジェクトで `api/*.go` を関数として扱わない場合、1 回目のデプロイ後の確認で分かる。そのときは 2 回目に進まず、動かす場所を考え直す。
- 切り替え時に全員が一度ログアウトされる（決定事項）。
- Go と TypeScript で検証がずれると、画面で保存できない・不正なデータを受け付けることがある。一致のテストで防ぐ。
