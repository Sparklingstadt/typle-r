# Android 版を Go のバックエンドに切り替える 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android アプリの「アカウント」を、Web版・iPad 版と同じ GitHub ログインと本番の `/api/workspace` で保存するようにする。

**Architecture:** HTTP・PKCE・revision 付き保存の決まりは JVM だけの `android/core` に置いて偽サーバーでテストし、app は
Custom Tabs・Keystore・画面だけを持つ薄い層にする。サーバーは `client=android` を足すだけ。

**Tech Stack:** Go（`server/internal/web`）、Kotlin・kotlinx.serialization（core）、Jetpack Compose・`androidx.browser`（app）、
JDK の `com.sun.net.httpserver`（core のテスト）。

**Spec:** `docs/superpowers/specs/2026-10-21-android-go-backend-design.md`

## Global Constraints

- 本番の URL の初期値は `https://typle-r-six.vercel.app`。
- URL は https のみ。http は `localhost`・`127.0.0.1`・`10.0.2.2`・`*.local` だけ（`network_security_config.xml` と同じ）。
- 通信のタイムアウトは接続・読み込みとも 30 秒。409 は全部で 3 回まで試す。ログイン途中の記録は 10 分で無効。
- 依存の追加は `androidx.browser:browser:1.8.0` のみ。
- 文言は `android/app/src/main/assets/messages/{ja,en}.json`。「iPad」「ブラウザー」「browser」「Keychain」を含めない。
  エラーは `TypleException("key")` と文字列リテラルで書く（`tests/android.test.cjs` がキーの有無を確かめる）。
- コメントは英語、コミットの件名と文書は日本語（リポジトリの慣例）。コミットの本文の最後は
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_014kofFmbet2tkFrUW6kEj17`。
- app はこの環境ではビルドできない（Google Maven に届かない）。app のコンパイルは CI（`android.yml`）で確かめる。
  core は `cd android/core && ../gradlew test` でローカルでも動く。

## Review Focus

1. ログイン中に OS がアプリを終了させ、`typle-r://login?code=…` で新しいプロセスが起動する → ログインが続いて完了する
   （Task 5：記録を SharedPreferences に保存し `onCreate` の intent も処理）。
2. 同じ `typle-r://login` が 2 回届く（戻る操作・再表示）→ 2 回目は何もしないか `accountLoginFailed`、token は壊れない
   （Task 5：記録はコールバックで必ず消す。Task 3：`finish` の失敗テスト）。
3. 練習の記録追加と端末の保存がほぼ同時 → どちらも保存され 409 にならない（Task 4：並行 `change` のテスト）。
4. サーバーが `revision: 0` を返す新しいアカウント → 初期リストが見え、最初の保存でそれが残る（Task 2・4 のテスト）。
5. 旧「アカウント（API）」を使っていた端末の更新 → 起動直後に「このタブレット」で使え、旧 token と URL は消える
   （Task 5：移行）。

---

### Task 1: サーバーが `client=android` を受け付ける

**Files:**
- Modify: `server/internal/web/auth.go`（`appClient` 定数と `signin`、コメントの「iPad」を「アプリ（iPad・Android）」に）
- Test: `server/internal/web/app_test.go`

**Interfaces:**
- Produces: `GET /api/auth/signin?client=android&code_challenge=<S256>` は `client=ipad` と同じ動き。

- [ ] **Step 1: 失敗するテストを書く** — `TestAppLoginAndroidClient`：既存の ipad のログインのテスト（25 行目付近）と同じ
  手順を `client=android` で行い、callback が `typle-r://login?code=…` に戻り、その code と verifier で
  `POST /api/auth/token` が 200 になることを確かめる。`client=android` で `code_challenge` が無い／42 文字のときは
  `typle-r://login?error=loginFailed` に戻ることも（142 行目付近のテストを table にして android を足してよい）。
- [ ] **Step 2: 失敗を確認** — `go test ./server/internal/web -run 'App' -race`：android のケースが FAIL。
- [ ] **Step 3: 実装** — `appClients = map[string]bool{"ipad": true, "android": true}` などで判定。動きは ipad と同一。
- [ ] **Step 4: 確認** — `gofmt -l server` が空、`go vet ./...`、`TYPLE_TEST_DATABASE_URL=postgresql://typle@127.0.0.1:5432/typle go test -race ./server/...` が PASS。
- [ ] **Step 5: コミット** — `feat: Android アプリのログイン（client=android）を受け付ける`

### Task 2: core の `AccountWorkspace`（形・検証・エラー対応）

**Files:**
- Create: `android/core/src/main/kotlin/io/github/sparklingstadt/typle/core/AccountWorkspace.kt`
- Test: `android/core/src/test/kotlin/io/github/sparklingstadt/typle/core/AccountWorkspaceTest.kt`

**Interfaces:**
- Produces:
  - `@Serializable data class AccountUser(val id: String, val name: String)`
  - `data class AccountWorkspace(val accountId: String, val revision: Int, val document: WorkspaceDocument)`
  - `fun decodeAccountWorkspace(data: ByteArray): AccountWorkspace`
  - `fun encodeAccountWorkspace(workspace: AccountWorkspace): ByteArray`
  - `fun accountError(key: String?, status: Int): TypleException`
  - `fun accountAddress(text: String): java.net.URI?`（`ApiWorkspaceStore.apiUrl` を移す：trim、host 必須、https か
    許された host の http）
  - `const val DEFAULT_ACCOUNT_URL = "https://typle-r-six.vercel.app"`

- [ ] **Step 1: 失敗するテストを書く**
  - `decodes a saved workspace`：`{"lists":[…1件…],"devices":[…],"revision":3,"accountId":"github:1","extra":1}` → revision 3、
    リスト・端末がそのまま。
  - `shows the starting lists before the first save`：`revision 0`、`lists: []` → `document.lists == initialLists()`。
  - `rejects what is not a workspace`：`revision -1`、`accountId ""`、`"not json"`、`lists` が無い → どれも
    `TypleException` の key `invalidServerData`。
  - `encodes the whole document with its revision`：encode → JSON に `lists`・`devices`・`revision`・`accountId`、decode し直すと同じ。
  - `refuses to send more than 1 MiB`：大きなリスト（words を多数）→ key `workspaceTooLarge`。
  - `maps the backend's errors`：表の全行。`"loginRequired"`・`"loginAccountChanged"` → `accountLoginRequired`、
    `"loginFailed"` → `accountLoginFailed`、`"authUnavailable"` → `accountUnavailable`、`"listLimit"` → `listLimit` で
    `values["max"] == MAX_LISTS.toString()`、`conflict`・`workspaceTooLarge`・`databaseUnavailable`・`invalidWorkspace`・
    `workspaceSaveFailed`・`forbiddenRequest`・`emptyRequest` はそのまま、`null` と 404 → `accountNotFound`、
    `"x"` と 500 → `workspaceRequestFailed`。
  - `accepts https and local http only`：`https://typle-r-six.vercel.app` 可、` https://x.example/ `（前後空白）可、
    `http://10.0.2.2:8081`・`http://localhost:8081`・`http://mac.local:8081` 可、`http://example.com`・`ftp://x`・`typle` は null。
- [ ] **Step 2: 失敗を確認** — `cd android/core && ../gradlew test --tests '*AccountWorkspaceTest*'`：コンパイルエラー。
- [ ] **Step 3: 実装** — 本文は `@Serializable private data class AccountWorkspaceBody(lists, devices: List<PracticeDevice>? = null, revision, accountId)`。
  検証は既存の `validateLists` と `decodeDevices`（`Workspace.kt` の `encodeWorkspaceFile` と同じ）。1 MiB は本文全体の
  バイト数で `MAX_WORKSPACE_BYTES` と比べる。`accountError` は各キーを `TypleException("…")` のリテラルで書く。
  `SerializationException` と `IllegalArgumentException` は `invalidServerData` に。
- [ ] **Step 4: 確認** — 同じコマンドで PASS、`../gradlew test` 全体も PASS。
- [ ] **Step 5: コミット** — `feat(android): アカウントのワークスペースの形と検証を core に足す`

### Task 3: core の `AccountClient` と `AccountLogin`

**Files:**
- Create: `android/core/src/main/kotlin/io/github/sparklingstadt/typle/core/AccountClient.kt`（両クラス）
- Test: `android/core/src/test/kotlin/io/github/sparklingstadt/typle/core/AccountClientTest.kt`、
  テスト用の偽サーバー `android/core/src/test/kotlin/io/github/sparklingstadt/typle/core/FakeTyple.kt`

**Interfaces:**
- Consumes: Task 2 の `accountError`、`AccountUser`。
- Produces:
  - `class AccountClient(val baseUrl: URI) { fun url(path: String, query: List<Pair<String, String>> = emptyList()): URI; fun send(method: String, path: String, body: ByteArray? = null, token: String? = null): ByteArray }`
    — path は `"api/workspace"` の形。base の末尾の `/` の有無にかかわらず `<base>/<path>`。
  - `class AccountLogin(baseUrl: URI, val verifier: String = newVerifier()) { val client: AccountClient; val signinUrl: URI; fun finish(callback: String): Pair<String, AccountUser>; companion object { const val CALLBACK_SCHEME = "typle-r"; fun newVerifier(): String; fun challengeOf(verifier: String): String } }`
  - `FakeTyple`（テスト用）：`HttpServer` を 127.0.0.1 の空きポートで起動し、`handle(method, path) { exchange -> … }` で
    答えを差し替え、受け取ったリクエスト（method・path・ヘッダー・本文）を記録する。`close()`。Task 4 でも使う。

- [ ] **Step 1: 失敗するテストを書く**
  - `challenge follows RFC 7636`：`challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"`。
  - `verifiers are 43 url-safe characters and differ`：`newVerifier()` が `^[A-Za-z0-9_-]{43}$`、2 回で違う。
  - `signin url names the android client`：`AccountLogin(URI("https://t.example/"), v).signinUrl.toString() == "https://t.example/api/auth/signin?client=android&code_challenge=${challengeOf(v)}"`。
  - `sends bearer token and json`：偽サーバーで `send("GET","api/workspace", token="t")` → `Authorization: Bearer t`、
    `Accept: application/json`、本文が返る。body 付きなら `Content-Type: application/json`。
  - `maps error answers`：409 `{"error":"conflict"}` → key `conflict`、404 本文なし → `accountNotFound`、
    500 `{"error":"x"}` → `workspaceRequestFailed`。
  - `unreachable server`：閉じたポート → `accountUnreachable`。
  - `finish trades the code`：偽サーバーの `POST /api/auth/token` が本文 `{"code":"c","verifier":v}` を受け取り
    `{"token":"tok","user":{"id":"github:1","name":"N","image":null}}` を返す → `("tok", AccountUser("github:1","N"))`。
  - `finish refuses other urls`：`typle-r://login?error=loginFailed`、`typle-r://login`（code なし）、`typle-r://login?code=`、
    `https://x/login?code=c`、`typle-r://other?code=c` → `accountLoginFailed`、サーバーには何も届かない。
- [ ] **Step 2: 失敗を確認** — `../gradlew test --tests '*AccountClientTest*'`：コンパイルエラー。
- [ ] **Step 3: 実装** — `HttpURLConnection`、`connectTimeout`・`readTimeout` 30000、`useCaches = false`。
  `IOException` は `accountUnreachable`（エラー本文は `errorStream` から読む）。JSON は `TypleJson`。verifier は
  `SecureRandom` 32 バイト → `Base64.getUrlEncoder().withoutPadding()`、challenge は SHA-256 の同じ符号化。
  `finish` は `URI(callback)` の scheme・host・query の `code` を確かめる（query は `&` と `=` で分けて URL デコード）。
- [ ] **Step 4: 確認** — PASS、全体も PASS。
- [ ] **Step 5: コミット** — `feat(android): GitHub ログインと Typle への通信を core に足す`

### Task 4: core の `AccountSync`（読み込みと revision 付き保存）

**Files:**
- Create: `android/core/src/main/kotlin/io/github/sparklingstadt/typle/core/AccountSync.kt`
- Test: `android/core/src/test/kotlin/io/github/sparklingstadt/typle/core/AccountSyncTest.kt`

**Interfaces:**
- Consumes: Task 2・3。
- Produces: `class AccountSync(baseUrl: URI, token: String, val accountId: String, private val renewed: (String) -> Unit) { fun load(): WorkspaceDocument; fun change(transform: (WorkspaceDocument) -> WorkspaceDocument): WorkspaceDocument; companion object { const val ATTEMPTS = 3 } }`
  — どちらも同期で、`ReentrantLock` で 1 つずつ実行する。

- [ ] **Step 1: 失敗するテストを書く**（偽サーバーは `/api/auth/session`・`/api/workspace` の GET/PUT を持ち、保存した
  revision を数える）
  - `load checks the session and renews the token`：session が `{"user":{"id":"github:1","name":"N"},"token":"new"}` →
    `renewed("new")` が 1 回、続く `GET /api/workspace` の Bearer が `new`。
  - `load refuses another account`：session の user が `github:2`、または `{"user":null}` → `accountLoginRequired`。
    workspace の `accountId` が違うときも同じ。
  - `change saves the whole document for its revision`：load（revision 3）→ `change { it.copy(devices = …) }` → PUT 本文の
    `revision` が 3、返り値は PUT の答えの文書。
  - `change before load`：→ `loadFailed`。
  - `conflict is retried on the latest data`：1 回目の PUT は 409、読み直しで revision 5 → 2 回目の PUT が revision 5 で
    transform を新しい文書にかけ直す（PUT は 2 回）。
  - `three conflicts give up`：PUT がずっと 409 → `conflict`、PUT はちょうど 3 回。
  - `first save keeps the starting lists`：revision 0（lists 空）を load → `change { it }` の PUT 本文の lists が `initialLists()`。
  - `concurrent changes do not conflict with each other`：2 つのスレッドで別々の変更を同時に `change` → 偽サーバーは
    revision が合わない PUT に 409 を返す設定でも、409 は 0 回、最後の文書に両方の変更がある。
- [ ] **Step 2: 失敗を確認** — `../gradlew test --tests '*AccountSyncTest*'`：コンパイルエラー。
- [ ] **Step 3: 実装** — 仕様の「AccountSync」のとおり。保持した `AccountWorkspace` は返った revision が新しいときだけ置き換える。
- [ ] **Step 4: 確認** — PASS、全体も PASS。
- [ ] **Step 5: コミット** — `feat(android): アカウントのワークスペースの読み込みと保存を core に足す`

### Task 5: app の保存先・ログイン・移行

**Files:**
- Create: `android/app/src/main/kotlin/io/github/sparklingstadt/typle/storage/AccountWorkspaceStore.kt`
- Delete: `android/app/src/main/kotlin/io/github/sparklingstadt/typle/storage/ApiWorkspaceStore.kt`
- Modify: `AppModel.kt`、`MainActivity.kt`、`AndroidManifest.xml`、`storage/TokenVault.kt`（コメントを GitHub の
  token から「Typle のログインの token」に）、`res/xml/network_security_config.xml`（コメントの参照先を `accountAddress` に）、
  `design/Components.kt:238`、`TypleApp.kt:283`、`home/HomeView.kt:135`、`gradle/libs.versions.toml`、`app/build.gradle.kts`、
  `assets/messages/{ja,en}.json`
- Test: `tests/android.test.cjs`（既存、`npm test` で動く）

**Interfaces:**
- Consumes: Task 2〜4。
- Produces（Task 6 の画面が使う）:
  - `enum class StorageKind { LOCAL, ACCOUNT }`
  - `AppModel.serverUrl: String`（`typle-r:server-url`、初期値 `DEFAULT_ACCOUNT_URL`）、`AppModel.accountUser: AccountUser?`
    （`typle-r:account` に JSON）
  - `fun AppModel.startSignIn(serverUrl: String): Uri` — URL が不正なら `TypleException("accountInvalidURL")`。
    verifier・URL・開始時刻（ms）を prefs `typle-r:login` に JSON で保存し、signin URL を返す。`signingIn = true`。
  - `suspend fun AppModel.finishSignIn(callback: String)` — `typle-r:login` を必ず消す。無い・10 分超え →
    `accountLoginFailed`。`AccountLogin(url, verifier).finish` は `Dispatchers.IO`。token を `TokenVault`、user を prefs、
    `serverUrl` を保存し `useStorage(ACCOUNT)`。結果（成功のメッセージかエラーの文）を
    `AppModel.signInMessage: Pair<Boolean, String>?`（failed, text）に入れ、`signingIn = false`。
  - `AppModel.signingIn: Boolean`、`fun AppModel.cancelSignInIfIdle()`（`onResume` でコールバックが来ていなければ
    `signingIn = false`。記録は消さない）
  - `suspend fun AppModel.useStorage(kind: StorageKind)`（引数は kind のみ。作れなければ `accountLoginRequired`）、
    `suspend fun AppModel.signOut()`（token と user を消して LOCAL）
  - `AccountWorkspaceStore(baseUrl: URI, token: String, accountId: String, renewed: (String) -> Unit) : WorkspaceStore`、
    `canDeleteRecords = true`。各操作は `withContext(Dispatchers.IO) { sync.change { … } }`。

- [ ] **Step 1: 文言のテストが新しいキーで失敗することを確認** — 先に Kotlin を書き換え（Step 2〜4）、`npm test -- tests/android.test.cjs`
  相当（`node --test tests/android.test.cjs`）で `ja: missing errors.accountLoginFailed` などが出ることを確かめる。
- [ ] **Step 2: `AccountWorkspaceStore`** — `LocalWorkspaceStore` と同じ 8 操作を core の関数で transform に。
  `duplicateList` は `LocalWorkspaceStore` と同じく copy を transform の外に取り出す。
- [ ] **Step 3: `AppModel`** — 上の Interfaces のとおり。`makeStore(ACCOUNT)` は `accountAddress(serverUrl)`・
  `vault.read()`・`accountUser` が揃うときだけ。起動時：prefs `typle-r:storage` が `"API"` なら `"LOCAL"` にし、
  `typle-r:api-url` と `vault.write(null)` で旧設定を消す。`"ACCOUNT"` で store が作れなければ LOCAL に戻す。
  `Launch.store`（スクリーンショット）は今までどおり優先。`hasToken` は消す。
- [ ] **Step 4: `MainActivity` と Manifest** — `launchMode="singleTask"`、intent-filter
  `VIEW`＋`DEFAULT`＋`BROWSABLE`、`<data android:scheme="typle-r" android:host="login" />`。`onCreate` と
  `onNewIntent` で `intent.data` が `typle-r://login…` なら ViewModel（`ViewModelProvider(this)[AppModel::class.java]`）の
  `finishSignIn` を `lifecycleScope` で呼び、`setIntent` で intent を消費する（回転で再実行しない）。`onResume` で
  `cancelSignInIfIdle()`。Custom Tabs を開く関数 `openSignIn(context, uri)` を `settings/` に置き、
  `ActivityNotFoundException` は `TypleException("accountNoLoginApp")`。依存
  `browser = "1.8.0"`、`androidx-browser = { module = "androidx.browser:browser", version.ref = "browser" }`。
- [ ] **Step 5: 他の `StorageKind.API`** — `Components.kt`・`TypleApp.kt`・`HomeView.kt` を `ACCOUNT` に。`TypleApp.kt` の
  `AccountButton` のコメントを GitHub ログインに。
- [ ] **Step 6: 文言** — 消す：`settings.storage.api`・`settings.storage.apiDetail`・`settings.token`・`settings.tokenSaved`・
  `settings.apiHint`・`settings.connect`・`errors.api*`（全 11 個、ほかで使っていなければ）。足す（ja / en。iPad の
  `ios/Typle/Resources/*/Localizable.strings` の文を「この iPad」→「このタブレット」「Keychain」→「Android Keystore」に
  直して使う。プレースホルダーは Android の `%s`・`%d`）：`settings.storage.account`・`settings.storage.accountDetail`・
  `settings.serverURL`（既にあれば文だけ見直す）・`settings.accountHint`・`settings.signIn`・`settings.signedIn`・
  `settings.useAccount`・`errors.accountLoginRequired`・`errors.accountLoginFailed`・`errors.accountUnavailable`・
  `errors.accountUnreachable`・`errors.accountNotFound`・`errors.accountInvalidURL`（「URL は https:// で始めてください。」/
  "The URL must start with https://."）・`errors.accountKeychainFailed` に相当する `errors.accountSaveFailed`
  （token を保存できない時）・`errors.accountNoLoginApp`（「GitHub のログインを開けるアプリがありません。Chrome などを入れてください。」/
  "No app on this tablet can open the GitHub login. Install Chrome or a similar app."）。`settings.storageHint` は
  「このタブレットとアカウントのデータは別々です。切り替えてもコピーはしません。」に。
- [ ] **Step 7: 確認** — `node --test tests/android.test.cjs` が PASS。`grep -rn "StorageKind.API\|ApiWorkspaceStore\|apiUrl\|typle-api.example" android/app/src` が空
  （移行のコメントと `"API"` の比較は除く）。core の `../gradlew test` が PASS。
- [ ] **Step 8: コミット** — `feat(android): アカウントの保存先を GitHub ログインと /api/workspace に切り替える`

### Task 6: 設定「一般」の画面

**Files:**
- Modify: `android/app/src/main/kotlin/io/github/sparklingstadt/typle/settings/GeneralSettingsView.kt`

**Interfaces:**
- Consumes: Task 5 の `StorageKind`・`serverUrl`・`accountUser`・`startSignIn`・`signingIn`・`signInMessage`・`useStorage`・
  `signOut`・`openSignIn`。

- [ ] **Step 1: 画面** — `ios/Typle/Settings/GeneralSettingsView.swift` の `storage` と同じ構成：2 択（「このタブレット」/
  「アカウント（GitHub）」）、アカウントでは `settings.serverURL` の入力（placeholder `DEFAULT_ACCOUNT_URL`、
  `KeyboardType.Uri`）、ログイン中なら `settings.signedIn` と名前、`settings.accountHint`。ボタン：LOCAL を選ぶと
  「このタブレットを使う」（保存先が LOCAL なら無効）、ACCOUNT では「GitHub でログイン」（`startSignIn` → `openSignIn`）、
  ログイン済みで保存先 LOCAL かつ URL が同じなら「アカウントに切り替える」、ログイン中なら「ログアウト」。処理中は
  `signingIn` も含めてボタンを無効にし進行表示。結果は既存のメッセージ表示（成功は `settings.connected` と件数、
  失敗は `errorText`）に `signInMessage` も出す。`settings.current` は ACCOUNT なら `settings.storage.account`。
- [ ] **Step 2: 確認** — `node --test tests/android.test.cjs` が PASS。`grep -n "token\|API" GeneralSettingsView.kt` に旧 UI が無い。
- [ ] **Step 3: コミット** — `feat(android): 一般の保存先を GitHub ログインの画面にする`

### Task 7: ドキュメントとバージョン

**Files:**
- Modify: `README.md`（「iPad のログイン」を iPad・Android 共通に、Android の記述）、`android/README.md`（45・52・55・57・64 行目付近）、
  `docs/api.md`（5 行目：Android も使わなくなった）、`package.json`・`package-lock.json`

- [ ] **Step 1: 文書** — Android はこの API を使わず、本番の GitHub ログインを使うこと。エミュレーターで `npm run dev` に
  つなぐ時は `http://10.0.2.2:<port>`（GitHub の OAuth App の callback が `AUTH_URL` に合っていること）を書く。
- [ ] **Step 2: バージョン** — `git fetch origin main --tags` で最新の版を確かめ、まだ使われていない次の minor
  （今は `0.57.0`）で `npm version 0.57.0 --no-git-tag-version`。
- [ ] **Step 3: 確認** — `npm run lint`、`npm run typecheck`、`DATABASE_URL=postgresql://typle@127.0.0.1:5432/typle npm test`、
  `node --test scripts/ci/release.test.cjs` が PASS。
- [ ] **Step 4: コミット** — `docs: Android 版の GitHub ログインを説明し、v0.57.0 にする`
