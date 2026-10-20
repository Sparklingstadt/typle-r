# API（Go）の書き込み 設計

- 日付: 2026-10-20
- 対象バージョン: v0.42.0
- 前提: v0.40.0 の読み取り専用API（`docs/superpowers/specs/2026-10-19-go-readonly-api-github-auth-design.md`）。GitHub のトークンで本人を確かめ、`github:<ID>` の `typle_workspaces` を読む

## 目的

GitHub のトークンで認証した本人が、スクリプトや別のアプリから自分のアカウント（クラウド保存）のリストを作成・変更・削除し、練習記録を追加できるようにする。

## 決定事項

| 項目 | 決定 |
|---|---|
| 書き込める範囲 | リストの作成・変更（名前・単語の全体置き換え）・削除と、記録の追加。端末は読み取りのまま |
| 有効にする方法 | 起動フラグ `-writable`。付けなければ今と同じ読み取り専用で、DB接続も `default_transaction_read_only=on` のまま |
| 許可 | `-writable` のときは、GitHub で本人と確かめられたトークンなら、そのアカウントのデータを書ける。トークンの権限（スコープ）は見ない |
| 同時保存 | トランザクション内で `SELECT … FOR UPDATE` で行をロックして読み、変更して `revision + 1` で書く。やり直しのループは持たない |
| アプリとの関係 | アプリの保存（`revision` の比較）はそのまま。Go が先に書いた場合、開いている画面の保存は既存どおり `409` を受けて読み込み直す |
| 形 | v0.32 の `/api/v1` の書き込みから、プロファイルと共有を除いた形 |
| 検証 | アプリの `validateList`・`saveList`・`validateLists`・`decodeLists` と同じ規則と上限 |
| アプリ本体 | 変更しない（`package.json` のバージョンとドキュメントだけ） |

## 範囲外

- 端末の作成・変更・削除、記録の削除・変更、リストの並べ替え、単語単位の追加・削除（`words` の全体置き換えで代える）
- トークンごとの読み取り・書き込みの区別、許可するユーザーの制限、レート制限
- 利用側が `revision` を渡す方式（`If-Match`・`ETag`）
- 本番へのデプロイ（今と同じく Vercel には載せない）

## エンドポイント

読み取り（`GET`・`HEAD`）は今のまま。`-writable` のときだけ次を受け付ける。

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `POST /api/v1/lists` | `{ "name", "words": [{ "display", "input", "annotation"? }] }` | `201 { "list" }`（`GET /api/v1/lists/{l}` と同じ形）。ID はサーバーが UUID v4 で発行し、`createdAt` は現在時刻（`toISOString` の形）。末尾に追加する |
| `PATCH /api/v1/lists/{l}` | `{ "name"?, "words"? }`（少なくとも一方） | `200 { "list" }`。`words` は全体を置き換える。記録・`createdAt`・並び順は残す |
| `DELETE /api/v1/lists/{l}` | なし | `204`（本文なし）。記録も一緒に消える |
| `POST /api/v1/lists/{l}/records` | `{ "id"?, "time", "date", "mistakes", "accuracy", "wordCount"?, "deviceId"? }` | 追加したら `201 { "record" }`。同じリストに同じ `id` の記録があれば追加せず `200 { "record" }`（保存済みの記録） |

`405` の `Allow` は、`-writable` のとき `/api/v1/devices` が `GET, HEAD`、`/api/v1/lists` と `/api/v1/lists/{l}/records` が `GET, HEAD, POST`、`/api/v1/lists/{l}` が `GET, HEAD, PATCH, DELETE`。`-writable` でないときはすべて `GET, HEAD`（今と同じ）。

### リストの検証

- `name`: 前後の空白を除いて1文字以上（`listNameRequired`）。保存するのは前後の空白を除いた名前。ほかのリストと同じ名前（前後の空白を除き、大文字小文字を区別しない。JavaScript の `toLocaleLowerCase` に合わせ、Go では `strings.ToLower`）は `listNameDuplicate`。変更では自分自身とは比べない。
- `words`: 1件以上（`wordsRequired`）。各単語の `display`・`input` は空白だけでない文字列（`wordFieldsRequired`）。`annotation` は省略時 `""`。単語の前後の空白はそのまま保存する（アプリと同じ）。
- 長さの上限（`validateLists` と同じ。長さは UTF-16 のコード単位で数える）: 名前200、単語1000件、`display`・`input` 1000、`annotation` 2000。超えたら `invalidList`。
- 作成時、リストがすでに100件以上あれば `listLimit`（作成だけが数を増やす）。

### 記録の検証

- `time`: 0以上の有限数（秒）。
- `date`: `workspace.ParseTime` で読める文字列。保存時は UTC の `toISOString` の形（`2026-10-10T02:00:00.000Z`）にそろえる。
- `mistakes`: 0以上の整数。`accuracy`: 0〜100の有限数。
- `wordCount`: 1以上の整数。省略時はリストの今の単語数。
- `id`: 省略時は UUID v4。指定するときは1〜100文字の `[A-Za-z0-9_-]`。
- 1リストの記録は10000件まで。超える追加は `recordLimit`（同じ `id` の再送は件数を増やさないので通る）。
- `deviceId`: 省略可。登録済みの端末の ID なら、その時点の `{ id, name, layout }` を記録にコピーする。`default` は組み込みの端末として `{ "id": "default", "name": "デフォルト", "layout": "" }` をコピーする（アプリの基準の言語の名前）。どちらでもなければ `deviceNotFound`。
- 上の値の誤り（`deviceNotFound`・`recordLimit` 以外）は `invalidRecord`。

### 本文

- `Content-Type` の種類（`;` より前）が `application/json` でなければ `415 unsupportedContentType`。
- 1MiB を超えたら `413 requestTooLarge`。
- JSON として読めない、型が違う、未知のフィールドがある、末尾に余計な値がある、`PATCH` で `name`・`words` のどちらもないときは `400 invalidJson`。

### 保存の大きさ

アプリの画面の保存（`PUT /api/workspace`）はリスト全体を端末・`revision`・`accountId` と一緒に 1MiB 以内で送る。その余地を残すため、保存後の `lists` 列の JSON が 896KiB（1MiB − 128KiB）を超える変更は `413 workspaceTooLarge` で、何も保存しない。保存前より小さくなる変更（削除・単語を減らす変更など）は、上限を超えていても通す。保存前の大きさも `Encode` の結果で測る（DB が返す `jsonb` の文字列は空白の入り方が違うため）。

## エラー

`{ "error": "<キー>" }`。判定の順序は 404（未知のパス）→ 405 → 認証（`401`・`503 githubUnavailable`）→ 本文（`415`・`413`・`400 invalidJson`）→ DB を読む → `404 listNotFound` → 検証（`400`・`413 workspaceTooLarge`）→ DB に書く。本文は認証の後で読む。

| ステータス | キー | 状況 |
|---|---|---|
| 400 | `invalidJson` | 本文の形が違う |
| 400 | `listNameRequired`・`listNameDuplicate`・`wordsRequired`・`wordFieldsRequired`・`invalidList`・`listLimit` | リストの検証 |
| 400 | `invalidRecord`・`recordLimit`・`deviceNotFound` | 記録の検証 |
| 404 | `listNotFound` | 指定したIDのリストがない |
| 405 | `methodNotAllowed` | そのパスで使えないメソッド。`-writable` でない書き込みもこれ |
| 413 | `requestTooLarge` | 本文が 1MiB を超える |
| 413 | `workspaceTooLarge` | 保存後のリストが 896KiB を超える |
| 415 | `unsupportedContentType` | `Content-Type` が JSON でない |
| 401・503 | `invalidToken`・`githubUnavailable`・`databaseUnavailable` | 今と同じ |

## 保存の流れ

`store.Store` に `Modify(ctx, owner, change func(*workspace.Workspace) (changed bool, err error)) (*workspace.Workspace, error)` を追加する。

1. トランザクションを始め、`SELECT lists::text, devices::text, revision FROM typle_workspaces WHERE owner_id = $1 FOR UPDATE`。
2. 行がなければ、最初の単語リスト（`workspace.Initial`）と空の端末で `INSERT … ON CONFLICT (owner_id) DO NOTHING`（`revision` は既定の1）し、1 に戻る（同時に作られた行も、ここで読み直してロックする）。
3. `workspace.Decode` で読み（読めなければエラー → `503 databaseUnavailable`）、`change` を適用する。`change` のエラー（キーを持つ型）はそのまま返し、トランザクションを取り消す。
4. `changed` が false（同じ `id` の記録の再送）なら書かずに終える。
5. `workspace.Encode` で `lists` 列を作り、896KiB の判定をして、`UPDATE … SET lists = $2::jsonb, revision = revision + 1, updated_at = now() WHERE owner_id = $1` してコミットする。`devices` 列は書かない。

アプリの保存（`UPDATE … WHERE owner_id AND revision`）は、ロック中は待ち、ロックが外れたあとは `revision` が合わずに `409` になる。行がないときのアプリの作成（`revision` 0）は主キーの重複で `409` になる。どちらも既存の動き。

`Open(ctx, connection, writable bool)` とし、`writable` が false のときだけ `default_transaction_read_only=on` を付ける。`-writable` のときは、DB のロールに `typle_workspaces` の `INSERT`・`UPDATE` の権限が要る。

## コードの構成

| パッケージ | 追加・変更 |
|---|---|
| `internal/workspace` | `Encode(lists) ([]byte, error)`: アプリの `decodeLists` が受け付ける JSON（`null` を書かない。記録の省略された項目は書かない）。変更の関数 `CreateList`・`UpdateList`・`DeleteList`・`AddRecord`（検証込み。エラーは `*workspace.Error{Key}`）。上限の定数 |
| `internal/store` | `Modify`、`Open` の `writable` |
| `internal/api` | 書き込みのハンドラー、本文の読み込み、`*workspace.Error` からステータスへの変換。`New(source, verifier, writable bool)`。`Source` とは別に `Writer` インターフェース（`Modify`） |
| `cmd/typle-api` | `-writable` フラグ。起動ログに読み取り専用か書き込み可能かを出す |

依存は今と同じく、標準ライブラリと pgx だけ。UUID は `crypto/rand` で作る。

## テスト

- `workspace`: 各変更関数の正常系と各エラーキー（重複名・大文字小文字、自分自身との比較、名前の前後の空白、各上限、`listLimit`、記録の `id` による冪等、`recordLimit`、端末と `default` のコピー、`deviceNotFound`、`wordCount` の既定値、日時を ISO にそろえる）。`Encode` → `Decode` で元に戻ること、`Encode` が `null` を含まないこと。
- `api`: 偽の `Source`・`Writer`・`Verifier` で、各エンドポイントのステータス・ヘッダー・本文、`-writable` でないときの `405` と `Allow`、`415`・`413`・`400 invalidJson`、エラーキーとステータスの対応、判定の順序（未認証では本文を読まない）。
- `store`（実DB、`TYPLE_TEST_DATABASE_URL` のときだけ）: 行がないアカウントへの最初の書き込み（最初の単語リスト＋変更）、`revision` が1増えること、`changed` が false なら `revision` が変わらないこと、`change` のエラーで何も変わらないこと、896KiB の判定、読み取り専用で開いた接続では書けないこと、同時に複数の `Modify` を走らせてもすべての変更が残ること。

## ドキュメントとリリース

- `docs/api.md` を「API（Go）」に改め、`-writable`、書き込みのエンドポイント、エラー、`curl` の例、DB ロールの権限を追加する。「範囲外」から書き込みを外す。
- README の Go API の段落（2か所）を読み書きに合わせて更新する。
- バージョン 0.42.0（`package.json`・`package-lock.json`）。リリースは `docs/release-workflow.md` の手順どおり PR から。
