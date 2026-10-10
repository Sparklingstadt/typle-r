# Typle API（個人用アクセストークンによる外部連携）設計

- 日付: 2026-10-10
- 対象バージョン: v0.32.0（機能追加）

## 目的

ログインユーザーが、自分のスクリプト・CLI・別アプリから、自分のアカウント（クラウド保存）の単語リストと練習記録を読み書きできるようにする。認証は `/settings` で発行する個人用アクセストークンで行う。

## 決定事項

| 項目 | 決定 |
|---|---|
| 利用者 | 自分用の外部連携。第三者アプリ向けの OAuth は作らない |
| 対象データ | GitHubログインのアカウント（`typle_workspaces`）のみ。ブラウザー保存（未ログイン）はサーバーにないため対象外 |
| 認証 | 個人用アクセストークン（`Authorization: Bearer typle_…`）。DBには SHA-256 ハッシュのみ保存 |
| 権限 | `read`（読み取り）と `write`（読み書き。`read` を含む）の2段階 |
| 有効期限 | 30日・90日（既定）・1年・無期限から選ぶ |
| API の形 | リソース単位の REST（`/api/v1`）。ワークスペース全体のスナップショット API にはしない |
| 書き込み方式 | サーバーが読み込み → core の関数で変更・検証 → 既存の `write`（revision による楽観ロック）。競合時はサーバー内で最大3回やり直す |
| トークン管理 | セッションCookie＋Origin一致のときだけ。トークン自身ではトークンを発行・失効できない |

## 範囲外（v1）

- プロファイル・端末の作成・変更・削除
- 記録の削除・変更
- 共有のオン・オフ
- 単語単位の追加・削除（`words` の全体置き換えで代える）
- トークンの名前・権限・期限の変更（失効して作り直す）
- レート制限
- OAuth・第三者アプリの登録

## データ

### トークンテーブル（マイグレーション `0005_api_tokens`）

```sql
CREATE TABLE "typle_api_tokens" (
  "token_id"     UUID           PRIMARY KEY,
  "owner_id"     TEXT           NOT NULL,
  "name"         TEXT           NOT NULL,
  "token_hash"   TEXT           NOT NULL UNIQUE,
  "prefix"       TEXT           NOT NULL,
  "scope"        TEXT           NOT NULL CHECK ("scope" IN ('read', 'write')),
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expires_at"   TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6)
);
CREATE INDEX ON "typle_api_tokens" ("owner_id");
```

既存テーブルは変更しないため、デプロイ切り替え中の旧アプリと互換。Prisma のモデル名は `ApiToken`。

- トークン文字列: `typle_` ＋ 32バイトの乱数を base64url にしたもの（43文字）。
- `token_hash`: トークン文字列全体の SHA-256（16進）。照合はハッシュの一致で行う。
- `prefix`: トークン文字列の先頭10文字（`typle_` ＋ 4文字）。一覧で見分けるためだけに使う。
- `name`: 前後の空白を除いて1〜50文字。同じ所有者内での重複は許す。
- `expires_at`: NULL は無期限。期限ちょうど以降は無効。
- 1アカウントあたり最大10個（期限切れも数える。失効＝行の削除）。
- `last_used_at`: 認証成功時、NULL または1時間以上前のときだけ更新する。

## トークン管理 API（画面用）

`GET/POST /api/tokens`、`DELETE /api/tokens/<tokenId>`。すべて Auth.js のセッションが必要（`github:<数字>`）。`POST`・`DELETE` は `PUT /api/workspace` と同じく `Origin` が `AUTH_URL`（未設定時はリクエストURL）のオリジンと一致すること、`POST` は `Content-Type: application/json` を必須とする。Bearer トークンでは呼べない。

| メソッド | 本文 | 応答 |
|---|---|---|
| `GET /api/tokens` | — | `200 { tokens: [{ id, name, prefix, scope, createdAt, expiresAt, lastUsedAt }] }`（新しい順）。ハッシュは返さない |
| `POST /api/tokens` | `{ name, scope: 'read' \| 'write', expiresIn: 30 \| 90 \| 365 \| null }`（日数） | `201 { token: { …上の1件 }, secret: 'typle_…' }`。`secret` を返すのはこの1回だけ |
| `DELETE /api/tokens/<id>` | — | `204`。他人のトークン・存在しないIDは `404` |

エラー: 未ログイン `401 loginRequired`、Origin・形式不一致 `403 forbiddenRequest`、本文の誤り `400 invalidTokenRequest`、上限 `409 tokenLimit`、DB `503 databaseUnavailable`。

## Typle API `/api/v1`

### 共通

- 認証: `Authorization: Bearer <トークン>`。ヘッダーなし・形式違い・未知・期限切れは `401 invalidToken`。`read` トークンで書き込みは `403 insufficientScope`。
- 所有者はトークンの行の `owner_id`。リクエストで所有者は指定できない。
- 応答は JSON、`Cache-Control: no-store`。エラーは `{ "error": "<errorsのキー>" }`。
- 書き込みの本文は `Content-Type: application/json` 必須（違えば `415 unsupportedContentType`）、最大 1MiB（超えたら `413 workspaceTooLarge`）、JSONとして読めなければ `400 invalidJson`。
- CORS ヘッダーは付けない（サーバー・スクリプトからの利用を想定し、ブラウザーの他サイトからは呼ばせない）。
- `{p}` はプロファイルID（最初のプロファイルは `default`）。存在しなければ `404 profileNotFound`（既存の `read` のように最初のプロファイルへ切り替えない）。`{l}` はリストID。存在しなければ `404 listNotFound`。
- DB の失敗は Sentry に送り `503 databaseUnavailable`。

### 読み取り（`read` 以上）

| メソッドとパス | 応答 |
|---|---|
| `GET /api/v1/profiles` | `{ profiles: [{ id, name, listCount, recordCount }] }` |
| `GET /api/v1/devices` | `{ devices: [{ id, name, layout }] }` |
| `GET /api/v1/profiles/{p}/lists` | `{ lists: [{ id, name, wordCount, recordCount, createdAt, shared }] }`（保存順） |
| `GET /api/v1/profiles/{p}/lists/{l}` | `{ list: { id, name, words: [{ display, input, annotation }], wordCount, recordCount, createdAt, shared, shareUrl? } }` |
| `GET /api/v1/profiles/{p}/lists/{l}/records` | `{ records: [...] }` 新しい順。`?since=<ISO日時>`（その時刻より後）、`?limit=`（1〜1000、既定100）。不正な値は `400 invalidQuery` |

`shared` は真偽値。`shareUrl` は共有中のときだけ `<AUTH_URL のオリジン>/shared/<shareId>`。

記録の形: `{ id?, time, date, mistakes?, accuracy?, wordCount?, device? }`（保存されている形のまま。古い記録は `id` などを持たないことがある）。

### 書き込み（`write`）

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `POST /api/v1/profiles/{p}/lists` | `{ name, words: [{ display, input, annotation? }] }` | `201 { list }`（詳細と同じ形）。ID はサーバーが UUID で発行。`createdAt` は現在時刻。末尾に追加 |
| `PATCH /api/v1/profiles/{p}/lists/{l}` | `{ name?, words? }`（少なくとも一方） | `200 { list }`。`words` は全体を置き換える。記録・共有の状態は残す |
| `DELETE /api/v1/profiles/{p}/lists/{l}` | — | `204`。共有中ならリンクも無効になる |
| `POST /api/v1/profiles/{p}/lists/{l}/records` | `{ id?, time, date, mistakes, accuracy, wordCount?, deviceId? }` | 追加したら `201 { record }`、同じ `id` が既にあれば追加せず `200 { record }`（既存の記録） |

単語・リストの検証は既存の `saveList`・`validateLists` に従う（名前必須・リスト名の重複不可（大文字小文字無視）・単語1件以上・`display`/`input` 必須、名前200文字・単語1000件・各フィールドの長さ上限、リストは1プロファイル100件まで）。`annotation` は省略時 `''`。違反は `400` と該当する既存のキー（`listNameRequired`・`listNameDuplicate`・`wordsRequired`・`wordFieldsRequired`・`listLimit`・`invalidWorkspace` など）。

記録の検証:

- `time`: 0以上の有限数（秒）。
- `date`: `Date.parse` できる文字列。保存時は ISO 形式に正規化する。
- `mistakes`: 0以上の整数。`accuracy`: 0〜100 の有限数。
- `wordCount`: 1以上の整数。省略時はリストの現在の単語数。
- `deviceId`: 省略可。指定時はアカウントの端末に存在すること（なければ `400 deviceNotFound`）。記録には端末の `{ id, name, layout }` をコピーする。
- `id`: 省略時はサーバーが UUID を発行。指定時は1〜100文字の `[\w-]`。同じリストに同じ `id` があれば冪等に既存を返す。
- 1リストの記録は10000件まで（既存の上限）。
- 上記の違反は `400 invalidRecord`（`deviceNotFound` を除く）。

リスト数の上限（100件）は `apiRequests.ts` が `listLimit` として先に判定する（`saveList` は上限を見ないため）。

### 追加するエラーキー

`errors.json`（6言語）に追加: `invalidToken`、`insufficientScope`、`unsupportedContentType`、`invalidJson`、`invalidQuery`、`profileNotFound`、`listNotFound`、`deviceNotFound`、`invalidRecord`、`invalidTokenRequest`、`tokenLimit`。API の利用者向けの値はキーそのもので、文言は画面（トークン管理）で表示するときに使う。

### 書き込みの流れ

`repository.modify(ownerId, profileId, fn)` を追加する。

1. `typle_workspaces` を読み、プロファイルの存在を確認する（なければ `profileNotFound`）。
2. `fn(view)` が新しい `lists`（と結果）を返す。`fn` は core の純粋関数で、検証に失敗したら `AppError` を投げる。
3. `write(ownerId, revision, { profileId, lists })` で保存する。共有の同期は既存どおり同じトランザクション内。
4. `write` が null（revision 競合）なら 1 からやり直す。3回失敗したら `409 conflict`。

ワークスペースの行がまだない（revision 0）アカウントは、空のワークスペースとして扱い、最初の書き込みで行を作る（既存の `write(owner, 0, …)` と同じ）。開いている Web 画面は次の保存で 409 を受けて読み込み直す（既存の動き）。

## コードの構成

| 層 | ファイル | 内容 |
|---|---|---|
| core | `src/core/apiTokens.ts` | トークン発行リクエストの検証、scope の判定、期限の計算、トークン文字列の形式チェック |
| core | `src/core/apiRequests.ts` | API 入力（リスト作成・更新、記録追加、記録の絞り込み）の検証と、ワークスペースへの適用、応答の形への変換。`saveList`・`addRecord`・`validateLists` を使う |
| plugins | `src/plugins/storage/cloud/tokens.ts` | `tokenRepository(client)`: 発行（`node:crypto` の乱数と SHA-256）、一覧、失効、照合、`last_used_at` の間引き更新 |
| plugins | `src/plugins/storage/cloud/repository.ts` | `modify(ownerId, profileId, fn)` を追加 |
| plugins | `src/plugins/storage/cloud/database.ts` | 同じ PrismaClient からトークンのリポジトリも返す |
| API | `src/app/api/v1/_lib/handler.ts` | Bearer 認証と scope、本文の読み込み、`AppError` からステータスへの変換、Sentry、`no-store` |
| API | `src/app/api/v1/**/route.ts` | 各エンドポイント（薄く保つ） |
| API | `src/app/api/tokens/route.ts`、`src/app/api/tokens/[id]/route.ts` | トークン管理 |
| 画面 | `src/components/Settings/ApiTokens.tsx` | `/settings` の「APIトークン」欄。一覧・発行ダイアログ（作成後に1回だけ表示、コピー）・失効の確認。未ログイン時は案内のみ |
| 文言 | `src/messages/<6言語>/settings.json`・`errors.json` | 追加するキーは6言語すべてに |

## テスト

- 単体（`tests/apiTokens.test.cjs`・`tests/apiRequests.test.cjs`）: トークン入力の検証と期限、トークン形式、scope。リスト作成・更新（重複名、単語置き換えで記録と共有が残る、上限）、記録追加（`id` による冪等、端末のコピー、`wordCount` の既定値、不正値）、記録の絞り込み。
- 実DB（`tests/apiDatabase.test.cjs`）: トークンはハッシュのみ保存、期限切れ・失効・他人のトークンが通らない、上限10個、`last_used_at` の間引き。`modify` の競合時のやり直し、共有リストの単語置き換えが共有テーブルに反映される。
- E2E（`tests/e2e/api.spec.ts`）: `/settings` でトークンを発行 → `request` で API を呼び、リスト作成・記録追加・同じ `id` の再送で1件のまま・`read` トークンでの書き込みが403・失効後が401 → `/edit` と `/records` に反映されていること。未ログインの `/settings` では案内だけ表示されること。
- 既存の i18n テストが新しいキーの6言語の一致を確認する。

## ドキュメントとリリース

- README に「Typle API」の節（トークンの発行と `curl` の例）。エンドポイントの詳細は `docs/api.md`。
- バージョン 0.32.0。`docs/release-notes/release-notes-v0.32.0.md` を追加。
- 本番デプロイ後の「匿名APIアクセスは401」の確認は、新しいエンドポイントでも成り立つ。
