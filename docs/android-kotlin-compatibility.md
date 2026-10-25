# Android・Kotlinバックエンドの互換性

Web・Goはこのリポジトリ、Androidは `Sparklingstadt/typle-android`（旧 `typle-a`）、Kotlinバックエンドは `Sparklingstadt/typle-kotlin-backend`。Android・Kotlinを変更する場合も、このリポジトリの最新mainを手元に用意する。Kotlinはローカル開発専用で、Goの `/api/v1` の並行実装ではない。

## 同期と確認が必要な箇所

| 正本（typle-r） | Android | Kotlinバックエンド | 確認する内容 |
|---|---|---|---|
| `src/plugins/packs/*.json`・`index.ts` | `core/src/main/resources/*.json`・`Workspace.kt` | `/api/workspace` は未保存時に空配列とrevision 0を返す。初期リストの展開はクライアント側 | JSON全体、ファイルの追加・削除、ID、順序、分類・タグ・グループ・段階 |
| `server/internal/web/auth.go`・`session/session.go` | `AccountClient.kt`・`AccountSync.kt`、アプリの `settings/SignIn.kt`・`storage/TokenVault.kt`・`MainActivity.kt`・`AndroidManifest.xml` | `web/AuthRoutes.kt`・`session/Keys.kt`・`Session.kt`・`auth/` | PKCE、コールバック、トークン形式と用途別鍵、有効期限、更新、BearerとCookieの区別 |
| `src/core/workspaceRequest.ts`・`workspaceDocument.ts`・`wordLists.ts`・`devices.ts`、`src/plugins/storage/cloud/client.ts` | `AccountWorkspace.kt`・`AccountSync.kt`・`Models.kt`・`StorageSerializers.kt`・`WordLists.kt`・`Devices.kt` | `web/Request.kt`・`WorkspaceRoutes.kt`、`workspace/Workspace.kt`・`Encode.kt` | 必須・任意項目、上限、エラーキー、既存データと未知の項目、UTF-16の文字数 |
| `server/internal/store/store.go`・`prisma/schema.prisma`・`prisma/migrations/` | 全体保存とrevision付き更新、409時の再取得・再適用 | `store/Store.kt`・`ConnString.kt`・`json/` | 同じ `typle_workspaces` 行、JSONB、部分更新、revisionの原子的な比較・更新、TLS設定 |
| `server/internal/web/web.go`・`request.go`・`workspace.go`、`auth/` | `AccountClient.kt`・`AccountWorkspace.kt` のHTTPとエラー処理 | `web/` | パス・メソッド・応答・ヘッダー、JSON制限、認証と所有者の判定順 |

Goの `server/internal/workspace/packs/*.json` にも初期リストの写しがある。WebのJSONを変えた場合はAndroidだけでなく、その写しの既存チェックも通す。

## 維持するAPI仕様

| API | 契約 |
|---|---|
| `GET /api/auth/signin?client=android&code_challenge=<S256>` | Android自身のPKCEとGitHub向けのサーバーPKCEを分ける。成功は `typle-r://login?code=…`、失敗は `typle-r://login?error=loginFailed` |
| `POST /api/auth/token` | JSONの `code`・`verifier` を照合し、`token`・`user` を返す。コードの通常の有効期間は2分。Cookieは発行しない |
| `GET /api/auth/session` | `user` は未ログインならnull。アプリのトークンは30日有効で、発行から24時間以降は応答の `token` で更新。更新もCookieにはしない |
| `GET/HEAD /api/workspace` | `lists`・`devices`・`revision`・`accountId`。未保存は空配列とrevision 0。初期リストはWeb・Androidが展開する |
| `PUT /api/workspace` | `accountId`・読み込んだrevisionと変更対象を送信。revision 0は新規作成、成功で1増える。省略したlists/devicesは保ち、明示的なnullは400。競合は409 `conflict`、アカウント違いは401 `loginAccountChanged` |
| 認証・保存の共通条件 | AuthorizationがあればCookieで救済せずBearerだけで判定。ブラウザーの変更には同一Origin、アプリにはBearerが必要。保存は `application/json`、本文は1 MiBまで。アカウントの応答は `private, no-store`、`Vary: Cookie` |

保存データでは古い `time`・`date` だけの記録と、分類・タグ・グループ・段階を維持する。リスト・単語・記録・記録内の端末の未知フィールドは編集後も保つ。廃止済みの `shared`・`shareId` は除去する。登録端末の追加フィールドはGo同様に正規化時に除去する。

## ローカルでの検証

Node 24以上、Go 1.25以上、JDK 21、マイグレーション済みのテスト専用PostgreSQLを使う。`DATABASE_URL` を暗黙に使わず、`TYPLE_TEST_DATABASE_URL` を明示する。このテストはランダムなテストアカウントの行を作り、終了時にその行だけ削除する。GitHubへの実ログインは不要で、公開のテスト鍵で作った認可コードを実際のトークン交換APIに渡す。

```sh
# typle-rで実行。Kotlinは既定で隣の ../typle-kotlin-backend を使う。
npm ci
TYPLE_TEST_DATABASE_URL=postgresql://… npm run test:compat
TYPLE_TEST_DATABASE_URL=postgresql://… TYPLE_BACKEND=kotlin npm run test:compat
TYPLE_TEST_DATABASE_URL=postgresql://… npm run test:compat:matrix

# Androidの実際のJVMクライアントもGo・Kotlinの両方に接続する。
TYPLE_TEST_DATABASE_URL=postgresql://… npm run test:compat:matrix -- --android

# 別の場所のチェックアウトを使う場合。
TYPLE_TEST_DATABASE_URL=postgresql://… TYPLE_KOTLIN_BACKEND=/path/to/typle-kotlin-backend \
  TYPLE_ANDROID=/path/to/typle-android npm run test:compat:matrix -- --android
```

同じ `tests/contracts/api.test.cjs` を両バックエンドに実行する。行の作成・更新、エラー、認証の境界、PKCE、更新されたトークン、150件の上限と分類・タグの境界値、部分更新、JSONの拒否を確認する。matrixでは同じDB行をGo→Kotlin→Goと読み書きし、両方から同じrevisionへの更新を競合させて、成功1件・409が1件になることも確認する。

`--android` はSDK不要の `core` の `BackendContractTest` を実行する。実際の `AccountLogin`・`AccountClient`・`AccountSync` でログイン、トークン更新、読み込み、他端末の更新による409、再取得・再適用、未知データの保持を確認する。Custom Tabs・ディープリンクのOS配送・Keystore・Compose・APK・端末操作の検証は別に必要。

保存データの共通fixtureは `tests/contracts/workspace.json`。Webの単体テスト、Goの `TestSharedWorkspaceContract`、両Kotlinリポジトリの `SharedContractTest` が同じファイルを使う。

```sh
# typle-r
npm test
go test ./...

# typle-android
TYPLE_R=../typle-r node --test tests/*.test.cjs
TYPLE_R=/absolute/path/to/typle-r ./gradlew -p core test
./gradlew :app:assembleDebug

# typle-kotlin-backend
TYPLE_R=../typle-r node --test tests/*.test.cjs
TYPLE_R=/absolute/path/to/typle-r TYPLE_TEST_DATABASE_URL=postgresql://… ./gradlew test
```

`TYPLE_R` がない場合は共通fixture・正本の変更検知を **skip** と表示する。単独のテスト成功を互換性確認済みとは扱わない。`TYPLE_R` を明示してパスが誤っていれば失敗する。Gradleはfixtureを入力として追跡し、fixtureが変われば再実行する。

## 正本の取り込み漏れを見つけたとき

両Kotlinリポジトリの `tests/upstream-contract.json` はレビュー済みの正本のファイル群とSHA-256を記録する。`TYPLE_R` 付きのNodeテストは、内容の変更だけでなく追加・削除も検出する。matrixも対象リポジトリのこのチェックを実行する。

差分が出たら該当ファイルの変更理由と対応実装を確認し、必要な修正と共通ケースを加える。共通fixture・HTTP matrix・Androidクライアントの検証を通してから、レビュー済みコミットとハッシュを更新する。ハッシュの一致はレビュー漏れの検出であり、互換性の証明を置き換えない。

## 既存E2Eの再現確認

```sh
# 先にテストDBを用意し、WebをビルドしてChromiumをインストールする。
npm run build
npx playwright install chromium
npm run test:e2e -- tests/e2e/practice.spec.ts \
  --grep 'mobile drawer closes|create, reorder, edit, play, reload and delete records' --repeat-each=5 --retries=0
TYPLE_BACKEND=kotlin TYPLE_KOTLIN_BACKEND=../typle-kotlin-backend npm run test:e2e -- \
  tests/e2e/practice.spec.ts --grep 'mobile drawer closes|create, reorder, edit, play, reload and delete records' \
  --repeat-each=5 --retries=0
```

`playwright.config.ts` のDBは従来どおり `DATABASE_URL` を使うので、こちらもテスト専用DBを指定する。KotlinのE2Eは先に `./gradlew installDist` が必要。

ドロワーのケースは幅390、リンク移動・Esc・背面クリック・1280への幅変更とフォーカス復帰を検証する。練習ケースはゲストのlocalStorageで作成・練習・記録削除を行い、保存失敗も1回注入する。どちらもAndroidリポジトリを直接使わず、ゲストの保存処理はバックエンドの保存APIを使わない。分割PRでこのテストやドロワーのソースは変更されていない。これは依存関係の確認であり、現在の環境での再現・安定化は上の反復実行結果とtraceで判断する。

CIのジョブが開始されない場合も、Release・デプロイを手動で迂回せず、このローカル検証結果と未検証項目をPRに記録する。Mac版のSwift共有コード同期はこのチェックの対象外。

## この変更での比較・検証結果

比較元は typle-r `b4ff19cf`、typle-android `8cb0c533`、typle-kotlin-backend `0cc554ff`。typle-rの最新構成はWebとGoだけで、iPadも独立済み。

- 初期リストの3つのJSONは一致した。AndroidのPKCE・Bearer・エラー変換・revision付きの保存と409の再試行はGoの仕様に対応していた。
- Kotlinはリスト上限100件のままで、Web・Go・Androidの150件と相違していた。修正前の実コマンドは共通APIテストで150件の保存を400 `listLimit` として拒否した。分類・タグも未知フィールド扱いで、Goの型・個数・UTF-16長の検証を欠いていたため、対応する既知フィールドと検証を追加した。
- Androidの未知フィールドはデコード時に破棄されていた。保存モデルのJSONシリアライザーと編集処理を修正し、リスト・単語・記録・記録内端末の未知フィールドを保つようにした。保存応答のaccountIdの照合も追加した。

| 実行した確認 | 結果と範囲 |
|---|---|
| Web単体テスト | 133件成功。共通fixtureの検証を含む |
| Go単体テスト・vet | 成功。通常のPostgreSQLが必要な任意のDBテストは未検証 |
| Kotlin単体・共通fixture | 成功。PostgreSQL接続が必要な任意のDBテストはskip |
| Android core単体・共通fixture | 71件成功。実バックエンド接続の1件は通常の単体実行ではskipし、別途matrixで成功 |
| 正本の変更検知・初期リスト・文言 | 成功。Android 25ファイル、Kotlin 30ファイルをレビュー済みとして追跡。ハッシュ不一致で失敗することも確認 |
| 共通HTTP matrix | 11件成功。Go・Kotlinの実コマンド、相互トークン、同じDB行の相互読み書き・競合を含む |
| Androidの実クライアント | `BackendContractTest` 成功。GoとKotlinの両方でログイン・更新・保存・409再試行・未知フィールド保持を確認 |
| Webの型・Lint・本番ビルド | 成功 |
| 指摘されていた2件のE2E | Go・Kotlinで各ケース3回、計12回成功（リトライなし、2 workers）。今回の環境では元の失敗を再現しなかった |
| APK・端末固有処理 | SDKがなく `assembleDebug` は依存解決で停止。APK、Custom Tabs、OSのコールバック配送、Keystore、Composeの動作は未検証 |

HTTP matrixとブラウザーE2EのDBは、一時的なPGliteのPostgreSQLプロトコル接続を使い、リポジトリのマイグレーションSQLを適用した。通常のPostgreSQLの接続ごとの状態やprepared statementを使う既存DBテストは、この代替環境では正しく検証できないため成功扱いにしていない。通常のPostgreSQLでのDBテストは別途必要。

E2Eでは標準配布のChromium取得が失敗したため、Chromium 153.0.8010.0をローカル用の起動引数で使用した。初期の起動・フォント設定によるブラウザー終了はアプリのテスト失敗と区別し、起動設定を直してから上記12回を実行した。3回の成功は不安定さが解消した証明ではなく、テスト・Web UIの変更は加えていない。PR #126の全変更ファイルにもこの2件のE2E・MobileNavは含まれていなかった。

確認時の最新mainの [CI](https://github.com/Sparklingstadt/typle-r/actions/runs/40203071656) はpolicyがstepなしで失敗し、verify・release・deployはskipだった。請求の復旧や本番公開成功は確認できていない。
