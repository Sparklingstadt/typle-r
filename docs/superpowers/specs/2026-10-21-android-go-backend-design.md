# Android 版を Go のバックエンドに切り替える 設計

日付: 2026-10-21

## 目的

Android アプリの「アカウント」の保存先を、自分で立てる `/api/v1`（typle-api `-writable`）と GitHub の個人用アクセス
トークンから、本番の Go の関数（`/api/auth/*`・`/api/workspace`）に切り替える。Web版・iPad 版（v0.56.0）と同じ
GitHub ログインで、同じデータを使えるようにする。

## 決めたこと

- ログイン画面は Custom Tabs（`androidx.browser`）。WebView は使わない（GitHub がブロックし、パスワードもアプリに
  見えてしまうため）。
- 「アカウント（API）」は無くす。`/api/v1` を使うアプリは無くなる（typle-api 自体はこの変更では消さない）。
- 保存は iPad と同じ方式 A：文書全体を revision 付きで PUT し、409 なら最新を読み直して同じ変更をやり直す
  （全部で 3 回）。アプリが知らない項目は保持しない（Web と項目は同じなので今は何も失われない）。

## 構成

### サーバー（Go）

- `GET /api/auth/signin` の `client` に `android` を足す。`ipad` と同じく S256 の `code_challenge` が必須で、
  ログインは `typle-r://login?code=…`（失敗は `?error=loginFailed`）に戻る。新しいエンドポイントは無い。
- 未知の `client` はこれまでどおり Web のログインとして扱う。

### Android core（JVM、Android SDK なしでテストできる）

HTTP と PKCE と保存の決まりは core に置き、`com.sun.net.httpserver` の偽サーバーで単体テストする。

- `AccountWorkspace.kt`
  - `AccountUser(id, name)`、`AccountWorkspace(accountId, revision, document)`。
  - `decodeAccountWorkspace(bytes)`：`revision < 0` や空の `accountId`、読めない JSON は `invalidServerData`。
    リストと端末はローカル保存と同じ検証。`revision == 0` なら `initialLists()` を見せる。
  - `encodeAccountWorkspace(ws)`：`{lists, devices, revision, accountId}`。送る前に同じ検証、1 MiB 超えは
    `workspaceTooLarge`。
  - `accountError(key, status)`：iPad の `AccountClient.error(for:)` と同じ対応表。
    `loginRequired`/`loginAccountChanged` → `accountLoginRequired`、`loginFailed` → `accountLoginFailed`、
    `authUnavailable` → `accountUnavailable`、`listLimit` → `listLimit`（max 付き）、`conflict`・
    `workspaceTooLarge`・`databaseUnavailable`・`invalidWorkspace`・`workspaceSaveFailed`・`forbiddenRequest`・
    `emptyRequest` はそのまま、ほかは 404 なら `accountNotFound`、それ以外 `workspaceRequestFailed`。
- `AccountClient`：`HttpURLConnection`、接続・読み込みとも 30 秒、`Accept: application/json`、
  `Authorization: Bearer …`、キャッシュなし。つながらない → `accountUnreachable`、JSON が読めない →
  `invalidServerData`、2xx 以外 → 本文の `error` を `accountError` で変換。呼び出しは同期（app が IO で呼ぶ）。
- `AccountLogin`：`SecureRandom` の 32 バイトを base64url にした verifier（43 文字）、その SHA-256 の challenge、
  `signinUrl`（`api/auth/signin?client=android&code_challenge=…`）、`finish(callbackUri)`：scheme `typle-r`・host
  `login`・空でない `code` を確かめて `POST /api/auth/token {code, verifier}` → `{token, user}`。`error=` や形の違う
  URL は `accountLoginFailed`。verifier から作り直せる（プロセスが終わっても続けられる）。
- `AccountSync`：`load()` と `change(transform)`（同期、`ReentrantLock` で 1 つずつ）。
  - `load()`：`GET /api/auth/session`（token 付き）。`user` が無い・ID が違う → `accountLoginRequired`。
    新しい `token` があれば保持し、`renewed(token)` を呼ぶ。続いて `GET /api/workspace`、`accountId` を確かめて保持。
  - `change(transform)`：保持した文書に transform をかけて PUT。`conflict` なら読み直してやり直し（全部で 3 回、
    最後も `conflict` ならそれを投げる）。返った revision が保持より新しいときだけ保持を更新。読み込み前は
    `loadFailed`。

### Android app

- `AccountWorkspaceStore`：`WorkspaceStore` の実装。`AccountSync` を `Dispatchers.IO` で呼ぶ薄い層。8 つの操作は
  core の既存関数（`saveList`・`addRecord`・`removeRecord`・`saveDevice` など）を transform に使う。
  `canDeleteRecords = true`、端末の編集もできる。
- `TokenVault`：そのまま使う（token）。user（id・name）は SharedPreferences `typle-r:account` に JSON で保存。
- `AppModel`
  - `StorageKind` は `LOCAL` と `ACCOUNT`（保存値は既存の設定との互換のため列挙名の `LOCAL`/`ACCOUNT`。旧 `API` は `LOCAL` に直す）。
  - `serverUrl`（`typle-r:server-url`、初期値 `https://typle-r-six.vercel.app`）、`accountUser`。
  - `startSignIn(serverUrl)`：URL を確かめ、ログイン途中の記録（verifier・サーバー URL・開始時刻）を保存して
    signin URL を返す。`finishSignIn(uri)`：記録を必ず消し、10 分以内なら `AccountLogin.finish`、token と user を
    保存して `useStorage(ACCOUNT)`。記録が無い・期限切れは `accountLoginFailed`。
  - `useStorage(kind)`、`signOut()`（token と user を消して `LOCAL` に）。端末の選択は
    `typle-r:device:${accountId}`。
  - 起動時：保存先が `ACCOUNT` で token か user が無ければ `LOCAL` に戻す。保存先が旧 `API` なら `LOCAL` に戻し、
    `typle-r:api-url` と旧 token を消す（1 回だけ）。
  - URL は https のみ。開発用に `localhost`・`127.0.0.1`・`10.0.2.2`・`*.local` は http も許す。
- `MainActivity`：`launchMode="singleTask"`、VIEW の intent-filter（scheme `typle-r`、host `login`、`BROWSABLE`）。
  `onCreate`（プロセスが終わった後）と `onNewIntent` で `typle-r://login` を `finishSignIn` に渡す。ログイン中に
  アプリへ戻った（`onResume` でコールバックが来ていない）ら「処理中」を解除し、何も表示しない。
- Custom Tabs で signin URL を開く。開けるアプリが無い（`ActivityNotFoundException`）なら `accountNoLoginApp`
  （「GitHub のログインを開けるアプリがありません。Chrome などを入れてください。」。文言に「ブラウザー」「browser」は
  使わない決まり：`tests/android.test.cjs`）。
- 設定「一般」：iPad と同じ作り。「このタブレット」「アカウント」の 2 択。アカウントではサーバー URL、ログイン中の
  名前、説明。ボタンは「このタブレットを使う」／「GitHub でログイン」、ログイン済みで保存先がローカルなら
  「アカウントを使う」、ログイン中なら「ログアウト」。結果のメッセージは iPad と同じ。
- 読み込み・保存の `accountLoginRequired` は既存のエラー表示で見せる。自動ではログアウトしない。
- 文言：`assets/messages/{ja,en}.json` の `settings.storage.api*`・`settings.token*`・`settings.apiHint`・
  `settings.connect` を消し、iPad と同じキー（`settings.storage.account*`・`settings.signIn`・`settings.signedIn`・
  `settings.useAccount`・`settings.accountHint`、`account*` のエラー、`accountNoLoginApp`）を足す。エラーは
  `TypleException("key")` と文字列で書く（`tests/android.test.cjs` がそこから `errors.key` の有無を確かめるため）。
- 消すもの：`ApiWorkspaceStore.kt`、`StorageKind.API`、`typle-r:api-url`。
- 依存の追加は `androidx.browser` のみ。

## テスト・CI

- Go：`client=android` が `typle-r://login` に戻ること、`code_challenge` が無い・形が違うと `loginFailed` で戻ること
  （`server/internal/web/app_test.go` に足す）。
- Android core（`android/core` の `../gradlew test`、ローカルと CI）：
  - `AccountWorkspace` の decode/encode（revision 0 の初期リスト、不正な値、1 MiB 超え）と `accountError` の表。
  - `AccountLogin`：verifier と challenge の形（RFC 7636 の例のベクトル）、signin URL、`finish` の成功と失敗。
  - `AccountClient`・`AccountSync`：偽サーバーで Bearer、session の更新 token、ID 不一致、409 からのやり直し
    （2 回目で成功／3 回とも 409）、新しい revision だけ保持。
- Android app：CI（`android.yml`）の `assembleDebug` とエミュレーターのスクリーンショット。設定画面の
  スクリーンショットで新しい保存先の表示を確かめる。
- 文言のキーが ja と en でそろっていること：既存の `tests/android.test.cjs`（`npm test`）。

## バージョン・ドキュメント

- `package.json` を新しい安定版（マージ直前に main とタグを確かめて決める。今は 0.57.0）。
- `README.md`：「iPad のログイン」を iPad と Android 共通の説明にする。`android/README.md`：保存先の表と
  手順を GitHub ログインに。`docs/api.md`：Android も `/api/v1` を使わなくなったことを書く。
- `docs/release-workflow.md`：Android はリリースしない（これまでどおり）ことを確かめ、必要なら一文足す。
