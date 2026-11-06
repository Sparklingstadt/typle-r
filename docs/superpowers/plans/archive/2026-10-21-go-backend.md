# アプリのバックエンドを Go にする Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub ログインと `/api/workspace` を Next.js（Auth.js・Prisma）から Go に移し、同じ Vercel プロジェクトの `api/*.go` で動かす。

**Architecture:** アプリ用のバックエンドは `server/internal/web` の 1 つの `http.Handler`。Vercel の `api/*.go` と手元の `server/cmd/typle-web` が同じハンドラーを使う。`internal` は `server/` の外から import できないため、`api/*.go` は `server/vercel`（internal でない橋渡しのパッケージ）を経由する。公開は 2 回: PR A（Task 1〜2、v0.54.0）で Vercel 上の Go を確かめ、PR B（Task 3〜11、v0.55.0）で切り替える。

**Tech Stack:** Go 1.25（`crypto/hkdf`・`crypto/hmac`）、pgx v5.9.2、`github.com/getsentry/sentry-go`（Task 8 から）、Next.js 16.4、Playwright、PostgreSQL 17（テスト用）

**Spec:** `docs/superpowers/specs/2026-10-21-go-backend-design.md`

## Global Constraints

- エラーの応答は `{ "error": "<キー>" }`。キーは今の `src/app/api/workspace/route.ts` と同じ（`loginRequired`・`forbiddenRequest`・`workspaceTooLarge`・`loginAccountChanged`・`invalidWorkspace`・`conflict`・`listLimit`・`databaseUnavailable`・`workspaceSaveFailed`）。
- `/api/workspace` と `/api/auth/session` の応答には `Cache-Control: private, no-store`。`/api/workspace` は `Vary: Cookie` も。
- 環境変数は `AUTH_SECRET`・`AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET`・`AUTH_URL`・`DATABASE_URL`（なければ `POSTGRES_URL`）・`SENTRY_DSN`（なければ `NEXT_PUBLIC_SENTRY_DSN`）・`SENTRY_ENVIRONMENT`。新しく Vercel に足す変数はない（手元だけ `TYPLE_WEB_URL`、既定 `http://127.0.0.1:8081`）。
- セッション Cookie: 名前は HTTPS で `__Host-typle-session`、HTTP で `typle-session`。有効 30 日、24 時間たったら更新。鍵は `AUTH_SECRET` から HKDF-SHA256（salt なし、info `typle session v1`、32 バイト）。OAuth の Cookie `typle-oauth` は info `typle oauth v1`、10 分、`Path=/api/auth`。
- アカウントは `^github:\d+$`。ローカル開発は `github:0`（名前「ローカル練習用」）。
- DB のプールは最大 5 接続・アイドル 30 秒。接続文字列は `store.ConnString` を通す。
- 依存の追加は `sentry-go` だけ（Go）。npm は削除だけ。
- 各タスクの終わりに、リポジトリ直下で `gofmt -l .`（空）・`go vet ./...`・`TYPLE_TEST_DATABASE_URL=… go test ./...`、と `npm run typecheck`・`npm test`・`npm run lint` を通す。Task 9 以降は `npm run build`・`npm run test:e2e` も。
- バージョン: PR A = 0.54.0、PR B = 0.55.0（main が先に進んでいたら次の空き番号）。`npm version X.Y.Z --no-git-tag-version` で `package.json` と `package-lock.json` を両方。
- `docs/release-workflow.md` の順序を守る。PR B は、PR A の本番デプロイで `/api/health` が 200 になったのを確かめてから、最新の main から作る。

## Review Focus

- `returnTo` に `//evil.example`・`/\evil.example`・`https://evil.example`・`/%2F%2Fevil.example`・空文字を渡しても、外のサイトへ戻さず `/home` か同じサイトのパスになる（Task 7 でテスト）。
- Auth.js の古い Cookie（`authjs.session-token`）だけを持ったブラウザーが来ても、`/api/workspace` は 500 でなく `401 loginRequired`、`/api/auth/session` は `{ "user": null }`（Task 5・7 でテスト）。
- 同じ `revision` の PUT が 2 つ同時に来たら、片方だけ 200、もう片方は 409（Task 4 でテスト）。
- 本文がちょうど 1MiB の PUT は受け付け、1MiB+1 バイトは 413（Task 5 でテスト）。
- `AUTH_SECRET` や `DATABASE_URL` がない Vercel の関数は、panic せずに 503 を返し、次のリクエストでやり直す（一度の失敗を覚え続けない）（Task 2・8 でテスト）。

---

## PR A（v0.54.0）: Vercel で Go を動かす

### Task 1: `go.mod` をリポジトリ直下へ移す

**Files:**
- Move: `server/go.mod` → `go.mod`、`server/go.sum` → `go.sum`
- Modify: `.github/workflows/ci.yml:70-84`、`.vercelignore`、`docs/api.md:16,344,350`、`README.md:67,242`

**Interfaces:**
- Produces: モジュール `github.com/sparklingstadt/typle-r`（import パスは今と同じ `github.com/sparklingstadt/typle-r/server/...`）

- [ ] **Step 1:** `git mv server/go.mod go.mod && git mv server/go.sum go.sum`。`go.mod` の `module` を `github.com/sparklingstadt/typle-r` にする。
- [ ] **Step 2:** 直下で `go build ./... && go vet ./... && TYPLE_TEST_DATABASE_URL=… go test ./...`。Expected: すべて成功（packs の `go:generate` の相対パスも含め、テストの結果は移す前と同じ）。
- [ ] **Step 3:** CI の Go のステップから `working-directory: server` を外し、`cache-dependency-path: go.sum` にする。コメントの「(server/)」はそのまま。
- [ ] **Step 4:** `.vercelignore` の `server` を `server/cmd` に変える。`*_test.go` も足す（関数のビルドに要らない）。
- [ ] **Step 5:** `docs/api.md` の起動・テストの手順を直下からの `go run ./server/cmd/typle-api`・`go test ./...` に、README の「`server/` で」を「リポジトリ直下で」に直す。
- [ ] **Step 6:** Commit: `refactor: Go のモジュールをリポジトリ直下に移す`

### Task 2: `/api/health` を Vercel の Go 関数で出す

**Files:**
- Create: `server/internal/web/web.go`、`server/internal/web/health.go`、`server/internal/web/health_test.go`、`server/vercel/vercel.go`、`server/vercel/vercel_test.go`、`api/health.go`
- Modify: `server/internal/store/store.go`（`OpenApp`・`Ping`）、`server/internal/store/store_test.go`、`.github/workflows/ci.yml`（デプロイ後の確認）、`docs/release-workflow.md`（手順 8）、`package.json`・`package-lock.json`（0.54.0）

**Interfaces:**
- Produces:
  - `store.OpenApp(ctx context.Context, connection string) (*Store, error)` — 書き込みできる接続、`MaxConns=5`、`MaxConnIdleTime=30s`。
  - `(*store.Store).Ping(ctx context.Context) error` — `SELECT 1`。
  - `web.Config{ Store Store }`（Task 5〜8 で項目を足す）と `web.Store` インターフェース（`Ping(ctx) error`、Task 5 で読み書きを足す）。
  - `web.New(c Config) http.Handler` — `GET /api/health` を扱う。ほかのパスは `404 { "error": "notFound" }`。
  - `vercel.Handler() http.Handler` — 環境変数から `web.Config` を作って `web.New` を返す。作れなければ（変数がない、DB に届かない）、そのリクエストに `503 { "error": "databaseUnavailable" }` を返して理由を `log` に出し、次の呼び出しでやり直す。作れたら使い回す（`sync.Mutex` で守る）。
  - `api/health.go`: `package handler`、`func Handler(w http.ResponseWriter, r *http.Request) { vercel.Handler().ServeHTTP(w, r) }`

- [ ] **Step 1: 失敗するテストを書く** — `health_test.go`:
  - `TestHealthOK`: `Ping` が nil の偽の `Store` で `GET /api/health` → 200、本文 `{"status":"ok"}`、`Cache-Control: no-store`。
  - `TestHealthDatabaseDown`: `Ping` がエラー → 503 `{"error":"databaseUnavailable"}`。
  - `TestHealthMethod`: `POST /api/health` → 405、`Allow: GET, HEAD`。
  - `vercel_test.go` の `TestHandlerWithoutDatabaseRetries`: `DATABASE_URL`・`POSTGRES_URL` を空にして 503、`t.Setenv` で `TYPLE_TEST_DATABASE_URL` の値を入れて 2 回目は 200（DB がなければ skip）。
  - `store_test.go` の `TestOpenAppPing`: `OpenApp` → `Ping` が nil。
- [ ] **Step 2:** `go test ./server/...` → 未定義で FAIL。
- [ ] **Step 3:** 上の Interfaces の通りに実装する。`web.New` は `http.ServeMux` に `"/api/health"` を登録。
- [ ] **Step 4:** `go test ./server/...` → PASS。`go vet ./...` に `api/` も含まれて通ること。
- [ ] **Step 5:** CI の「Check production home and authentication boundary」に、`https://typle-r-six.vercel.app/api/health` が 200 であることの確認を足す（今の 401 の確認と同じ書き方。`--retry 3`）。`docs/release-workflow.md` の手順 8 に同じことを書く。
- [ ] **Step 6:** `npm version 0.54.0 --no-git-tag-version`。
- [ ] **Step 7:** Commit: `feat: Vercel で Go の関数を動かし、/api/health で DB への接続を確かめる（v0.54.0）`
- [ ] **Step 8:** PR A を push。CI の verify が緑になったら、ユーザーにマージを頼む。マージ後のデプロイで `/api/health` が 200 になったことを確かめる。**200 にならなければ PR B に進まず、ユーザーに報告する。**

---

## PR B（v0.55.0）: ログインと `/api/workspace` を Go に切り替える

最新の main から `claude/keen-noether-bxleck` を作り直して始める。

### Task 3: セッションの Cookie

**Files:**
- Create: `server/internal/session/session.go`、`server/internal/session/session_test.go`、`tests/e2e/sessionCookie.ts`、`tests/sessionCookie.test.cjs`

**Interfaces:**
- Produces（Go）:
  - `type Session struct { Sub, Name, Image string; IssuedAt, Expires time.Time }`（JSON は `sub`・`name`・`image`・`iat`・`exp`、時刻は Unix 秒）
  - `type OAuth struct { State, Verifier, ReturnTo string; Expires time.Time }`（JSON は `state`・`verifier`・`returnTo`・`exp`）
  - `type Keys struct{ … }`、`NewKeys(secret string) (Keys, error)`（空なら error）
  - `(Keys) Seal(s Session) string`、`(Keys) Open(value string, now time.Time) (Session, bool)`
  - `(Keys) SealOAuth(o OAuth) string`、`(Keys) OpenOAuth(value string, now time.Time) (OAuth, bool)`
  - `New(sub, name, image string, now time.Time) Session`（`Expires = now + 30 日`）、`(Session) NeedsRenewal(now time.Time) bool`（`now - IssuedAt >= 24h`）
  - `CookieName(secure bool) string`、`const MaxAge = 30 * 24 * time.Hour`、`OAuthMaxAge = 10 * time.Minute`、`OAuthCookie = "typle-oauth"`
- Produces（TS、E2E 用）: `sealSession(secret: string, session: { sub: string; name: string; image: string; iat: number; exp: number }): string`

形式: `base64url(JSON)` + `.` + `base64url(HMAC-SHA256(key, base64url(JSON)))`（パディングなし）。`Open` は、HMAC を `hmac.Equal` で比べ、`exp` が過ぎていない、`sub` が `^github:\d+$` に合う、のすべてを満たすときだけ true。`OpenOAuth` は `exp` だけ確かめる。

- [ ] **Step 1: 失敗するテストを書く** — `session_test.go`:
  - `TestSealOpen`: `Seal` → `Open` で同じ値。
  - `TestOpenRefuses`: 署名の 1 文字を変える／JSON 部分を別のものに差し替える／`exp` 切れ／`sub` が `github:abc`／`.` がない／空文字 → すべて false。
  - `TestOAuthKeyIsSeparate`: `SealOAuth` の値を `Open` に渡すと false（鍵が違う）。
  - `TestNeedsRenewal`: 発行から 23 時間は false、24 時間で true。
  - `TestVector`: secret `typle-e2e-only-not-a-production-secret-32-bytes`、`{sub:"github:1", name:"E2E User", image:"", iat:1700000000, exp:1702592000}` の `Seal` が固定の文字列 `VECTOR` に一致する。
  - `tests/sessionCookie.test.cjs`: 同じ入力で `sealSession` が同じ `VECTOR` になる。
- [ ] **Step 2:** `go test ./server/internal/session/` → FAIL。
- [ ] **Step 3:** Go を実装し、`TestVector` の出力から `VECTOR` を決めて Go と TS の両方のテストに書く。TS は `node:crypto` の `hkdfSync('sha256', secret, Buffer.alloc(0), 'typle session v1', 32)` と `createHmac`。JSON のキーの順は `sub, name, image, iat, exp` に固定（Go は構造体の項目順）。
- [ ] **Step 4:** `go test ./server/internal/session/ && npm test` → PASS。
- [ ] **Step 5:** Commit: `feat: Go でセッションの Cookie を署名して確かめる`

### Task 4: `revision` で競合を検出する読み書きと、保存の検証

**Files:**
- Modify: `server/internal/workspace/encode.go`（`CheckLimits`）、`server/internal/workspace/workspace_test.go`、`server/internal/store/store.go`、`server/internal/store/store_test.go`

**Interfaces:**
- Consumes: `workspace.Decode`・`Encode`・`EncodeDevices`、`store.Store`（Task 2）
- Produces:
  - `workspace.CheckLimits(lists []List) error` — `validateLists`（`src/core/workspaceRequest.ts`）と同じ上限（単語 `MaxWords`・記録 `MaxRecords`・名前 `MaxListName`・`input`/`display` `MaxWordText`・`annotation` `MaxAnnotation`、UTF-16 で数える）。超えたら `&Error{Key: "invalidWorkspace"}`。
  - `type store.Saved struct { Workspace *workspace.Workspace; Revision int }`
  - `(*Store).ReadRevision(ctx, owner string) (*Saved, error)` — 行がなければ `nil, nil`。
  - `type store.Change struct { Lists []workspace.List; Devices []workspace.Device; HasLists, HasDevices bool }`
  - `(*Store).WriteRevision(ctx, owner string, revision int, change Change) (*Saved, error)` — 競合は `store.ErrConflict`、リスト数の超過は `&workspace.Error{Key: "listLimit"}`。

順（spec の「書き込み」）: `revision == 0` は、空に対して `len(change.Lists) > MaxLists`（空は 0 件なので数が増える）なら `listLimit`、次に `INSERT … ON CONFLICT (owner_id) DO NOTHING RETURNING lists::text, devices::text, revision`（0 行なら `ErrConflict`）。それ以外は、行を読み、ない・`revision` が違うなら `ErrConflict`。次に `len(change.Lists) > MaxLists && len(change.Lists) > len(saved)` なら `listLimit`。最後に `UPDATE … SET lists, devices, revision = revision + 1, updated_at = now() WHERE owner_id = $1 AND revision = $2 RETURNING …`（0 行なら `ErrConflict`）。省略された側（`HasLists`/`HasDevices` が false）は保存済みのまま。

- [ ] **Step 1: 失敗するテストを書く**
  - `workspace_test.go` の `TestCheckLimits`: 単語 1000 は通り 1001 は断る。記録 10000/10001、名前 200/201（`𠮷` は 2 単位）、`annotation` 2000/2001 も同様。
  - `store_test.go`（DB）:
    - `TestReadRevisionMissing`: 行なし → `nil, nil`。
    - `TestWriteRevisionCreate`: `revision 0` → `Revision == 1`。もう一度 `revision 0` → `ErrConflict`。
    - `TestWriteRevisionUpdate`: 1 → 2。古い 1 で → `ErrConflict`。
    - `TestWriteRevisionKeepsOmitted`: `HasDevices` だけで、保存済みのリストが残る。
    - `TestWriteRevisionListLimit`: 101 件を `revision 0` で → `listLimit`。保存済み 101 件（DB に直接入れる）に 101 件で → 成功、102 件で → `listLimit`。古い `revision` で 102 件 → `ErrConflict`（競合が先）。
    - `TestWriteRevisionConcurrent`: 同じ `revision` で 2 つの goroutine → 片方だけ成功、もう片方は `ErrConflict`。
    - `TestWriteRevisionKeepsUnknownFields`: 単語に知らない項目 `x` → 読み返して残る。
- [ ] **Step 2:** `go test ./server/...` → FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `TYPLE_TEST_DATABASE_URL=… go test ./server/...` → PASS。
- [ ] **Step 5:** Commit: `feat: Go で revision による楽観ロックの読み書きをする`

### Task 5: `/api/workspace`

**Files:**
- Create: `server/internal/web/workspace.go`、`server/internal/web/workspace_test.go`、`server/internal/web/request.go`（本文の読み取りと検証）
- Modify: `server/internal/web/web.go`（`Config` に `Keys session.Keys`・`BaseURL *url.URL`・`Now func() time.Time`・`Report func(r *http.Request, err error, operation string)`（nil なら `log` に出すだけ）。`Store` に `ReadRevision`・`WriteRevision`）

**Interfaces:**
- Consumes: Task 3 の `session.Keys`・`Open`・`CookieName`、Task 4 の `ReadRevision`・`WriteRevision`・`CheckLimits`
- Produces:
  - `(*server).owner(r *http.Request) (session.Session, bool)` — Cookie（`CookieName(BaseURL.Scheme == "https")`）を `Open` する。Task 7 も使う。
  - `(*server).sameOrigin(r *http.Request) bool` — `Origin` が `BaseURL` のオリジンと完全一致。Task 7 も使う。
  - `decodeRequest(body []byte) (revision int, change store.Change, err error)` — エラーは `errLegacy`（→409）か、それ以外（→400 `invalidWorkspace`）。

判定の順は spec の PUT の表の通り。本文は `http.MaxBytesReader` ではなく、1MiB+1 バイトまで読んで超えたら 413（読み終わる前に打ち切る）。JSON は 1 つのオブジェクト。`revision` は `json.Number` で受け、0 以上 2^53-1 以下の整数だけ。`profileId` が `"default"` 以外の値、または `profiles` キーがあれば `errLegacy`。`lists`・`devices` は `null` を省略と同じにせず 400（今の `decodeLists` が `null` を断るのと同じ。Task のテストで TS と突き合わせる）。`lists` は `workspace.Decode` を通してから `CheckLimits`。

- [ ] **Step 1: 失敗するテストを書く** — `workspace_test.go`（DB を使うものは `TYPLE_TEST_DATABASE_URL`、ないものは偽の Store）:
  - `TestGetLoginRequired`: Cookie なし → 401 `loginRequired`。`authjs.session-token` だけ → 401。改ざんした Cookie → 401。
  - `TestGetEmpty`: 行なし → 200 `{"lists":[],"devices":[],"revision":0,"accountId":"github:…"}`、`Cache-Control: private, no-store`、`Vary: Cookie`。
  - `TestPutForbidden`: `Origin` が別 → 403。`Content-Type: text/plain` → 403。`application/json; charset=utf-8` は通る。
  - `TestPutTooLarge`: 1MiB ちょうど（`lists` の中に長い空白を入れて作る）は 413 にならない。1MiB+1 → 413 `workspaceTooLarge`。
  - `TestPutAccountChanged`: 本文の `accountId` が違う → 401 `loginAccountChanged`。
  - `TestPutInvalid`: `revision` が `-1`・`1.5`・`"0"`・ない → 400。`lists` の名前 201 文字 → 400。`lists: null` → 400。
  - `TestPutLegacy`: `profileId: "p2"` → 409。`profiles: []` → 409。`profileId: "default"` → 200。
  - `TestPutFlow`: `revision 0` で作成 → 200 `revision 1`。古い `0` → 409。`1` で更新 → `revision 2`。GET で同じ内容。
  - `TestPutListLimit`: 101 件を `revision 0` → 400 `listLimit`。
  - `TestDatabaseDown`: Store がエラー → GET は 503 `databaseUnavailable`（`Report` が `workspace.read` で 1 回）、PUT は 503 `workspaceSaveFailed`（`workspace.write`）。
  - `TestMatchesTypeScript`: `tests/workspace.test.cjs` の `validateWorkspaceRequest` の入力（共有の項目を捨てる、`revision` の不正、名前 201、`profileId`、101 件）を Go の `decodeRequest` に通し、受け付ける・断る（と 409）が同じ。
- [ ] **Step 2:** `go test ./server/internal/web/` → FAIL。
- [ ] **Step 3:** 実装し、`web.New` に `/api/workspace` を登録する。
- [ ] **Step 4:** `TYPLE_TEST_DATABASE_URL=… go test ./server/...` → PASS。
- [ ] **Step 5:** Commit: `feat: Go で /api/workspace を読み書きする`

### Task 6: GitHub の OAuth の通信

**Files:**
- Create: `server/internal/auth/oauth.go`、`server/internal/auth/oauth_test.go`
- Modify: `server/internal/auth/github.go`（`/user` の取得を `User` に切り出し、`Owner` はそれを使う）

**Interfaces:**
- Produces:
  - `type auth.User struct { ID int64; Login, Name, AvatarURL string }`、`(u User) Account() string`（`github:<ID>`）、`(u User) DisplayName() string`（`Name` が空白だけなら `Login`）
  - `(*GitHub).User(ctx, token string) (User, error)` — `ErrInvalidToken`・`ErrUnavailable` は今の `Owner` と同じ。キャッシュ・回数制限は `Owner` だけに残す。
  - `type OAuth struct { ClientID, ClientSecret string; AuthorizeURL, TokenURL string; Client *http.Client }`、`NewOAuth(clientID, clientSecret string) *OAuth`（`https://github.com/login/oauth/authorize`・`https://github.com/login/oauth/access_token`、タイムアウト 10 秒）
  - `(*OAuth) AuthorizeURL(state, challenge, redirectURI string) string` — `client_id`・`redirect_uri`・`state`・`code_challenge`・`code_challenge_method=S256`。`scope` は付けない。
  - `(*OAuth) Exchange(ctx, code, verifier, redirectURI string) (token string, err error)` — `POST`（form）、`Accept: application/json`。応答に `error` があるか `access_token` が空なら error。

- [ ] **Step 1: 失敗するテストを書く**（GitHub は `httptest.Server`）:
  - `TestUserFields`: `{"id":1,"login":"octo","name":"","avatar_url":"https://a"}` → `DisplayName()=="octo"`、`Account()=="github:1"`。
  - `TestOwnerStillCaches`: 既存の `Owner` のテストがそのまま通る。
  - `TestAuthorizeURL`: クエリの 5 つの値と、`scope` がないこと。
  - `TestExchange`: 送った form（`client_id`・`client_secret`・`code`・`code_verifier`・`redirect_uri`）を確かめ、`access_token` を返す。`{"error":"bad_verification_code"}` → error。500 → error。
- [ ] **Step 2:** `go test ./server/internal/auth/` → FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `go test ./server/internal/auth/` → PASS。
- [ ] **Step 5:** Commit: `feat: Go で GitHub の OAuth のコードをトークンに交換する`

### Task 7: ログイン・セッション・ログアウトのエンドポイント

**Files:**
- Create: `server/internal/web/auth.go`、`server/internal/web/auth_test.go`
- Modify: `server/internal/web/web.go`（`Config` に `OAuth OAuthClient`・`GitHub UserSource`・`LocalLogin bool`）

**Interfaces:**
- Consumes: Task 3、Task 5 の `owner`・`sameOrigin`、Task 6
- Produces:
  - `web.OAuthClient`（`AuthorizeURL`・`Exchange`）と `web.UserSource`（`User`）のインターフェース
  - `safeReturnTo(value string) string` — `/` で始まり、2 文字目が `/` でも `\` でもなく、`url.Parse` してホストがない値だけそのまま返す。ほかは `/home`。
  - ルート: `GET /api/auth/signin`、`GET /api/auth/callback/github`、`GET /api/auth/session`、`POST /api/auth/signout`、`POST /api/auth/local`（`LocalLogin` が false なら 404 `notFound`）
- `redirect_uri` は `BaseURL` + `/api/auth/callback/github`。
- Cookie は `Secure` を `BaseURL.Scheme == "https"` のときだけ付ける。ログアウトはセッションの Cookie を `Max-Age=-1` で消す。

- [ ] **Step 1: 失敗するテストを書く**（偽の `OAuthClient`・`UserSource`、時刻は `Config.Now`）:
  - `TestSafeReturnTo`: `/lists?x=1` はそのまま。`//evil.example`・`/\evil.example`・`https://evil.example`・`evil`・空 → `/home`。`/%2F%2Fevil.example` は同じサイトのパスなのでそのまま。
  - `TestSigninRedirects`: 302 で偽の `AuthorizeURL` へ。`typle-oauth` Cookie（`HttpOnly`・`SameSite=Lax`・`Path=/api/auth`・`Max-Age=600`）を `OpenOAuth` すると `returnTo` が入っている。`challenge` が `verifier` の S256 になっている。
  - `TestCallbackSuccess`: 正しい `state` と Cookie → `Exchange` に `code`・`verifier`・`redirect_uri` が渡り、302 で `returnTo` へ。セッション Cookie を `Open` すると `sub == "github:1"`・`name`・`image`。`typle-oauth` は消える。
  - `TestCallbackRefuses`: `state` が違う／Cookie なし／Cookie の期限切れ／`error=access_denied` → 302 で `returnTo`（分からなければ `/home`）、セッション Cookie なし、`Exchange` は呼ばれない。
  - `TestCallbackGitHubFails`: `Exchange` か `User` がエラー → 302 で `returnTo`、セッションなし、`Config.Report` が `auth.callback` で 1 回呼ばれる。
  - `TestSession`: Cookie なし → `{"user":null}`。あり → `{"user":{"id":"github:1","name":…,"image":…}}`。発行から 25 時間 → `Set-Cookie` で更新。1 時間 → 更新しない。`authjs.session-token` だけ → `{"user":null}`。
  - `TestSignout`: 別の `Origin` → 403 `forbiddenRequest`。同じ → 204 と、消す `Set-Cookie`。
  - `TestLocalLogin`: `LocalLogin` false → 404。true で同じ `Origin` → 204、セッションの `sub == "github:0"`、`name == "ローカル練習用"`。
  - `TestCookieName`: `BaseURL` が `https://…` なら `__Host-typle-session` に `Secure`、`http://…` なら `typle-session`。
- [ ] **Step 2:** `go test ./server/internal/web/` → FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `go test ./server/internal/web/` → PASS。
- [ ] **Step 5:** Commit: `feat: Go で GitHub のログインとセッションを扱う`

### Task 8: 設定の組み立て・Sentry・Vercel の入口・`typle-web`

**Files:**
- Create: `server/internal/web/config.go`、`server/internal/web/config_test.go`、`server/cmd/typle-web/main.go`、`api/workspace.go`、`api/auth/session.go`、`api/auth/signin.go`、`api/auth/signout.go`、`api/auth/callback/github.go`
- Modify: `server/vercel/vercel.go`、`server/vercel/vercel_test.go`、`go.mod`・`go.sum`（sentry-go）

**Interfaces:**
- Consumes: Task 2〜7
- Produces:
  - `web.FromEnv(getenv func(string) string, local bool) (Config, error)` — `AUTH_SECRET`・`AUTH_URL`（`http`/`https` の URL）・`AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET` を読む。足りなければ、足りない変数の名前を含む error（Store はここでは開かない）。`local` が true のときだけ `LocalLogin` を `localDevelopmentEnabled`（`src/lib/localDevelopment.ts`）と同じ条件で決める（`NODE_ENV` の条件は除く）。
  - `web.NewReporter(getenv func(string) string) func(*http.Request, error, string)`（`Config.Report` に入れる） — DSN があれば `sentry.Init`（環境は `SENTRY_ENVIRONMENT`）、送ったら `sentry.Flush(2 * time.Second)`。DSN がなければ `log` に出すだけ。タグ `operation` に 3 つ目の引数（`workspace.read`・`workspace.write`・`auth.callback`）。
  - `vercel.Handler()` は `FromEnv(os.Getenv, false)` と `store.OpenApp` を使う。どちらかが失敗したら 503（`/api/workspace` と `/api/health` は `databaseUnavailable`、`/api/auth/*` は `{ "error": "authUnavailable" }`）を返し、次の呼び出しでやり直す。
  - `typle-web`: `-addr`（既定 `127.0.0.1:8081`）、`.env.local`・`.env` は読まない（`npm run dev` が渡す）。`FromEnv(os.Getenv, true)`。タイムアウトは `typle-api` と同じ。
  - `api/*.go`: どれも `package handler` で、`func Handler(w, r) { vercel.Handler().ServeHTTP(w, r) }`。

- [ ] **Step 1: 失敗するテストを書く**
  - `TestFromEnvMissing`: `AUTH_SECRET` がない → error に `AUTH_SECRET`。`AUTH_URL` が `ftp://x` → error。
  - `TestFromEnvLocalLogin`: `local=true` で `LOCAL_DEVELOPMENT_LOGIN=1`・`AUTH_URL=http://127.0.0.1:3000` → true。`https://…` → false。`http://192.168.1.2:3000` で `LOCAL_DEVELOPMENT_LAN_HOST=192.168.1.2` → true、`LAN_HOST` なし → false。`local=false` → いつも false。
  - `vercel_test.go` の `TestHandlerWithoutSecret`: `AUTH_SECRET` なしで `/api/auth/session` → 503 `authUnavailable`、panic しない。値を入れた次の呼び出しで 200。
- [ ] **Step 2:** `go test ./server/...` → FAIL。
- [ ] **Step 3:** `go get github.com/getsentry/sentry-go@latest`（2 週間以上前の版）して実装する。
- [ ] **Step 4:** `go test ./server/... && go vet ./...` → PASS。`go run ./server/cmd/typle-web` を `.env.local` の値で起動し、`curl -s 127.0.0.1:8081/api/auth/session` → `{"user":null}`。
- [ ] **Step 5:** Commit: `feat: Go のバックエンドを Vercel の関数と typle-web で起動する`

### Task 9: 画面側と開発の起動を Go に向ける

**Files:**
- Create: `src/lib/session.tsx`、`scripts/dev.cjs`
- Modify: `src/components/AuthProvider.tsx`、`src/components/AccountBar.tsx`、`src/components/LegacyImport.tsx`、`src/components/About/StorageComparison.tsx`、`src/components/Navbar/StorageBadge.tsx`、`src/lib/useWordLists.tsx`、`src/app/local-login/page.tsx`、`src/app/local-login/local-login-form.tsx`、`scripts/dev-lan.cjs`、`next.config.mjs`、`package.json`（`dev`・`dev:local`）

**Interfaces:**
- Produces（`src/lib/session.tsx`、`"use client"`）:
  - `type SessionUser = { id: string; name: string; image: string | null }`
  - `SessionProvider({ children })` — マウント時に `GET /api/auth/session`（`cache: 'no-store'`）。
  - `useSession(): { data: { user: SessionUser } | null; status: 'loading' | 'authenticated' | 'unauthenticated'; update: () => Promise<void> }`
  - `signIn(): void` — `location.assign('/api/auth/signin?returnTo=' + encodeURIComponent(location.pathname + location.search))`
  - `signOut(): Promise<void>` — `POST /api/auth/signout` の後に `location.assign('/home')`
- `next.config.mjs`: `process.env.VERCEL !== '1'` のときだけ `rewrites` で `/api/workspace`・`/api/health`・`/api/auth/:path*` を `TYPLE_WEB_URL`（既定 `http://127.0.0.1:8081`）へ。
- `scripts/dev.cjs`: `.env*` を `loadEnvConfig` で読み、`go run ./server/cmd/typle-web` と `next dev`（引数はそのまま渡す）を起動する。片方が終わったらもう片方に同じシグナルを送る。`dev-lan.cjs` も同じ関数で 2 つ起動する（`typle-web` の `-addr` は `127.0.0.1:8081` のまま）。
- `/local-login`: サーバーアクションをやめる。ページは今まで通り `localDevelopmentEnabled()` で 404 にし、フォームは `fetch('/api/auth/local', { method: 'POST' })` の後に `update()`。

- [ ] **Step 1:** `src/lib/session.tsx` を作り、6 か所の import を `next-auth/react` から `@/lib/session` に変える。`AccountBar` の `signIn('github')` は `signIn()`、`signOut({ callbackUrl: '/home' })` は `signOut()`。`session.user.image` が `null` のときの表示は今と同じ。
- [ ] **Step 2:** `/local-login` を書き換える。
- [ ] **Step 3:** `next.config.mjs`・`scripts/dev.cjs`・`dev-lan.cjs`・`package.json` を変える。
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` → PASS。`npm run dev` を `LOCAL_DEVELOPMENT_LOGIN=1` で起動し、`/local-login` でログイン → `/edit` でリストを保存 → 再読み込みで残る → ログアウト、を Playwright のスクリプトか手で確かめる。
- [ ] **Step 5:** Commit: `feat: 画面のログインと保存を Go のバックエンドに向ける`

### Task 10: Next.js の API・Auth.js・Prisma クライアントを消し、E2E を Go で回す

**Files:**
- Delete: `src/app/api/`、`src/auth.ts`、`src/plugins/storage/cloud/database.ts`、`src/plugins/storage/cloud/repository.ts`、`src/plugins/storage/cloud/databaseUrl.ts`
- Modify: `playwright.config.ts`、`tests/e2e/account.spec.ts`（ほかに `next-auth/jwt` を使う spec があれば同様に）、`tests/workspace.test.cjs`（Prisma のリポジトリのテストを消し、`validateWorkspaceRequest` のテストは残す）、`tests/databaseUrl.test.cjs`（消す。同じ確認は Go の `TestConnString` にある）、`package.json`・`package-lock.json`、`.env.example`

**Interfaces:**
- Consumes: Task 3 の `sealSession`、Task 8 の `typle-web`

- [ ] **Step 1:** `playwright.config.ts` の `webServer` を配列にする: 1 つ目 `go run ./server/cmd/typle-web -addr 127.0.0.1:8081`（`env` に `AUTH_SECRET`・`AUTH_URL=http://127.0.0.1:3101`・`AUTH_GITHUB_ID=e2e`・`AUTH_GITHUB_SECRET=e2e`・`DATABASE_URL`、`url: http://127.0.0.1:8081/api/health`）、2 つ目は今の `next start`。
- [ ] **Step 2:** E2E の Cookie を `sealSession(secret, { sub: accountId, name: 'E2E User', image: '', iat: now, exp: now + 3600 })`、名前 `typle-session` にする。`account.spec.ts` の確認（401・403・409・アカウントの分離・ログアウト）は変えない。
- [ ] **Step 3:** 上の Delete のファイルを消す。`grep -rn "next-auth\|@/auth\|cloud/database\|cloud/repository\|databaseUrl" src tests scripts` が空になるまで直す。
- [ ] **Step 4:** `npm uninstall next-auth @prisma/adapter-pg` し、`@prisma/client`・`pg`・`@types/pg` は `scripts/`・`tests/` で使っていなければ消す（`grep` で確かめる。`prisma`（CLI）は残す）。`.env.example` の `AUTH_URL` の説明に、Go も同じ値を使うと書く。
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` と Go のチェック → すべて PASS。
- [ ] **Step 6:** Commit: `refactor: Next.js の API と Auth.js・Prisma クライアントを消す`

### Task 11: ドキュメントとバージョン

**Files:**
- Modify: `README.md`（構成・開発の始め方に Go 1.25 が要ること・`npm run dev` が 2 つ起動すること・OAuth の設定は変わらないこと・テストの説明・切り替え時に一度ログアウトされること）、`docs/api.md`（`server/` の構成に `internal/web`・`internal/session`・`vercel`・`cmd/typle-web` を足す）、`package.json`・`package-lock.json`（0.55.0）

- [ ] **Step 1:** ドキュメントを直す。今の README の Auth.js・Prisma 実行時の説明（`grep -n "Auth.js\|NextAuth\|Prisma" README.md`）を、Go の説明に置き換える。
- [ ] **Step 2:** `npm version 0.55.0 --no-git-tag-version`。
- [ ] **Step 3:** すべてのチェック（Global Constraints）→ PASS。
- [ ] **Step 4:** Commit: `docs: バックエンドを Go にした構成を書く（v0.55.0）`
- [ ] **Step 5:** PR B を push。CI が緑になったらユーザーにマージを頼む。デプロイ後、本番で GitHub のログイン → 保存 → 再読み込み → ログアウトを手で確かめてもらう（自動テストできない部分）。
