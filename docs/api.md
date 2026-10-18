# Typle API

GitHubでログインしたアカウント（クラウド保存）の単語リストと練習記録を、スクリプトや別のアプリから読み書きするためのAPIです。認証には `/settings` の「APIトークン」で発行する個人用アクセストークンを使います。自分のアカウントのデータだけが対象で、第三者アプリ向けのOAuthはありません。ブラウザー保存（未ログイン）のデータはサーバーにないため扱えません。

ベースURLは `https://typle-r-six.vercel.app`、APIは `/api/v1` 以下です。以下の例では、発行したトークンを環境変数に入れてあるものとします。

```sh
export TYPLE_TOKEN='typle_…'
```

## トークン

`/settings` の「APIトークン」で、GitHubにログインした状態から発行します。

- 名前（前後の空白を除いて1〜50文字）、権限、有効期限を選びます。
- 権限は `read`（読み取り）と `write`（読み書き。`read` を含む）です。
- 有効期限は30日・90日（既定）・365日・無期限から選びます。期限ちょうど以降は使えません。
- 1アカウントで10個まで発行できます。期限切れのトークンも数えます。上限に達したら、不要なものを失効してから発行します。
- トークン文字列（`typle_` ＋ 43文字）が表示されるのは発行直後の1回だけです。サーバーにはSHA-256のハッシュと、一覧で見分けるための先頭10文字（`prefix`）だけを保存するため、あとから再表示はできません。紛失したら失効して作り直します。
- 名前・権限・期限は変更できません。変える場合は失効して作り直します。
- 一覧には最終使用日時が出ます。1時間に1回までの粒度で更新します。

## 共通事項

### v0.34.0 での変更

プロファイル機能を廃止したため、パスからプロファイルを外しました。`/api/v1/profiles/{p}/lists/…` は `/api/v1/lists/…` に、`GET /api/v1/profiles` はなくなりました。旧パスは `404` です。追加のプロファイルにあったリストは、最初のプロファイルのリストの後ろに移っています（名前が重なるリストは「名前（プロファイル名）」になります）。リストIDは変わりません。ただし、同じIDのリストが最初のプロファイルにもあった場合だけ、移したほうのIDが `<プロファイルID>-<リストID>` になります。

### 認証

すべてのリクエストに `Authorization: Bearer <トークン>` を付けます。

- ヘッダーがない、形式が違う、未知のトークン、期限切れ、失効済みはすべて `401 invalidToken` です。理由は区別できません。応答には `WWW-Authenticate: Bearer` が付きます。
- `read` のトークンで書き込み（`POST`・`PATCH`・`DELETE`）を呼ぶと `403 insufficientScope` です。
- データの所有者はトークンから決まります。リクエストで指定することはできません。

### 応答

- 本文はJSON、`Cache-Control: no-store` です。CORSヘッダーは付けないため、ブラウザーの他サイトからは呼べません。サーバーやスクリプトから利用してください。
- 書き込みの本文は `Content-Type: application/json` が必須です（違えば `415 unsupportedContentType`）。最大1MiBで、超えると `413 workspaceTooLarge`、JSONとして読めないと `400 invalidJson` です。
- エラーは `{ "error": "<キー>" }` の形で、ステータスコードとキーを返します。文言は返しません。

```json
{ "error": "listNotFound" }
```

### 上限

| 項目 | 上限 |
|---|---|
| トークン | 1アカウント10個 |
| リスト | 1アカウント100件（超えると `400 listLimit`） |
| リスト名 | 200文字 |
| 単語 | 1リスト1000件。`display`・`input` は各1000文字、`annotation` は2000文字 |
| 記録 | 1リスト10000件 |
| 記録の取得 | `limit` 1〜1000（既定100） |
| 書き込みの本文 | 1MiB |
| リスト全体 | 896KiB。書き込み後のリスト（記録を含む）をJSONにした大きさ。超える書き込みは `413 workspaceTooLarge` で、何も保存されない（Web画面で保存した分がすでに超えていても、リストの削除など小さくする書き込みはできる） |

リスト名・単語の検証は画面の単語リスト編集と同じです。リスト名は必須で、前後の空白を除いて同じ名前（大文字小文字を区別しない）は作れません。単語は1件以上で、`display` と `input` は空や空白だけにはできません。これらや上限の違反は、`listNameRequired`・`listNameDuplicate`・`wordsRequired`・`wordFieldsRequired`・`listLimit`・`invalidWorkspace` のいずれかで `400` を返します。形が違う入力（文字列でない名前など）は `invalidWorkspace` です。

### リスト

パスの `{l}` はリストIDです。存在しなければ `404 listNotFound` です。

書き込みの本文の検証は、リストの存在確認より先に行います。そのため、本文が不正で対象も存在しないときは `400` が返ります。

### エラー一覧

| ステータス | キー | 状況 |
|---|---|---|
| 400 | `invalidJson` | 本文がJSONではない |
| 400 | `invalidQuery` | `since`・`limit` が不正 |
| 400 | `invalidRecord` | 記録の値が不正、または記録が10000件に達している |
| 400 | `deviceNotFound` | `deviceId` に一致する端末がない |
| 400 | `listNameRequired` `listNameDuplicate` `wordsRequired` `wordFieldsRequired` `listLimit` `invalidWorkspace` | リストの入力が不正（上の「上限」を参照） |
| 401 | `invalidToken` | トークンがないか無効 |
| 403 | `insufficientScope` | `read` のトークンで書き込みを呼んだ |
| 404 | `listNotFound` | 対象がない |
| 409 | `conflict` | 同時に保存された変更とぶつかり、サーバー内で3回やり直しても保存できなかった |
| 413 | `workspaceTooLarge` | 本文が1MiBを超えた、または書き込み後のリスト全体が896KiBを超える |
| 415 | `unsupportedContentType` | 書き込みの `Content-Type` が `application/json` ではない |
| 503 | `databaseUnavailable` | DBの障害、または保存済みのデータが読めない。しばらくしてからやり直す |

### 書き込みの同時実行

書き込みは、サーバーが最新のデータを読み、変更し、revisionによる楽観ロックで保存します。ほかの保存とぶつかったときは、サーバー内で最大3回やり直します。Web画面を開いたままAPIで書き込んだ場合、画面側は次の保存で `409` を受けて読み込み直します。

## 読み取り（`read` 以上）

### `GET /api/v1/devices`

練習端末の一覧です。記録に端末を付けるときの `deviceId` に使います。

```json
{ "devices": [{ "id": "d1", "name": "自宅のキーボード", "layout": "JIS" }] }
```

### `GET /api/v1/lists`

リストの一覧（保存順）です。単語は含みません。

```json
{
  "lists": [{
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "英単語",
    "wordCount": 120,
    "recordCount": 8,
    "createdAt": "2026-10-10T01:23:45.000Z",
    "shared": false
  }]
}
```

### `GET /api/v1/lists/{l}`

単語を含む詳細です。`shared` は真偽値で、共有リンクがオンのときだけ `shareUrl` が付きます。

```json
{
  "list": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "英単語",
    "words": [{ "display": "apple", "input": "apple", "annotation": "りんご" }],
    "wordCount": 1,
    "recordCount": 8,
    "createdAt": "2026-10-10T01:23:45.000Z",
    "shared": true,
    "shareUrl": "https://typle-r-six.vercel.app/shared/0b1c…"
  }
}
```

### `GET /api/v1/lists/{l}/records`

練習記録を新しい順（`date` の降順）に返します。

| クエリ | 内容 |
|---|---|
| `since` | ISO形式などの日時。その時刻より後の記録だけを返す |
| `limit` | 1〜1000の整数（既定100） |

`since=abc`、`limit=0`、`limit=1001`、`limit=1.5` のような値は `400 invalidQuery` です。

```json
{
  "records": [{
    "id": "run-2026-10-10-001",
    "time": 63.5,
    "date": "2026-10-10T02:00:00.000Z",
    "mistakes": 2,
    "accuracy": 97.5,
    "wordCount": 120,
    "device": { "id": "d1", "name": "自宅のキーボード", "layout": "JIS" }
  }]
}
```

記録は保存されている形のまま返します。古い記録には `id`・`wordCount`・`device` がないことがあります。

## 書き込み（`write`）

### `POST /api/v1/lists`

リストを末尾に追加します。IDはサーバーがUUIDで発行し、`createdAt` は現在時刻です。

| フィールド | 内容 |
|---|---|
| `name` | 必須。リスト名 |
| `words` | 必須。`[{ display, input, annotation? }]`。`annotation` を省略すると空文字 |

応答は `201 { "list": { … } }`（詳細と同じ形）です。

### `PATCH /api/v1/lists/{l}`

`name` と `words` の少なくとも一方を送ります。`words` は全体を置き換えます（単語単位の追加・削除はありません）。記録と共有の状態は残り、共有中なら公開リンクの内容も新しい単語になります。名前も単語も保存済みと同じなら何も保存しません。応答は `200 { "list": { … } }` です。

### `DELETE /api/v1/lists/{l}`

リストを記録ごと削除します。共有中ならリンクも無効になります。応答は `204`（本文なし）です。

### `POST /api/v1/lists/{l}/records`

練習記録を追加します。

| フィールド | 必須 | 内容 |
|---|---|---|
| `time` | 必須 | 所要時間（秒）。0以上の有限数 |
| `date` | 必須 | 練習の完了時刻。`Date.parse` できる文字列。保存時にISO形式（UTC）へ正規化する |
| `mistakes` | 必須 | ミスの回数。0以上の整数 |
| `accuracy` | 必須 | 正確率。0〜100の有限数 |
| `wordCount` | 任意 | 練習した単語数。1以上の整数。省略するとリストの現在の単語数 |
| `deviceId` | 任意 | 端末ID（`GET /api/v1/devices`）。指定すると端末の `{ id, name, layout }` を記録にコピーする。ない端末は `400 deviceNotFound` |
| `id` | 任意 | 記録のID。1〜100文字の英数字・`_`・`-`。省略するとサーバーがUUIDを発行する |

値の違反は `400 invalidRecord` です。

- 追加できたら `201 { "record": { … } }` を返します。
- 同じリストに同じ `id` の記録が既にあるときは、何も追加せずに既存の記録を `200 { "record": { … } }` で返します。
- したがって、`id` を自分で決めて送れば、通信が途切れて結果が分からないときも、同じ内容をそのまま再送できます。記録が二重になりません。再送で本文が違っても既存の記録は変わりません。

## 例

### 一覧を読む

```sh
curl -H "Authorization: Bearer $TYPLE_TOKEN" \
  https://typle-r-six.vercel.app/api/v1/lists
```

### リストを作る（`write`）

```sh
curl -X POST \
  -H "Authorization: Bearer $TYPLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"英単語","words":[{"display":"apple","input":"apple","annotation":"りんご"},{"display":"banana","input":"banana"}]}' \
  https://typle-r-six.vercel.app/api/v1/lists
```

応答の `list.id` が、以降の `{l}` です。

### 単語を置き換える（`write`）

```sh
curl -X PATCH \
  -H "Authorization: Bearer $TYPLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"words":[{"display":"cherry","input":"cherry"}]}' \
  https://typle-r-six.vercel.app/api/v1/lists/$LIST_ID
```

### `id` 付きで記録を追加し、再送する（`write`）

```sh
curl -X POST \
  -H "Authorization: Bearer $TYPLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"run-2026-10-10-001","time":63.5,"date":"2026-10-10T02:00:00Z","mistakes":2,"accuracy":97.5}' \
  https://typle-r-six.vercel.app/api/v1/lists/$LIST_ID/records
# 初回は 201。同じコマンドを再実行すると 200 で既存の記録が返り、件数は増えない。
```

### 最近の記録を読む

```sh
curl -H "Authorization: Bearer $TYPLE_TOKEN" \
  "https://typle-r-six.vercel.app/api/v1/lists/$LIST_ID/records?since=2026-10-01T00:00:00Z&limit=20"
```

## トークンの管理用エンドポイント

`/settings` の画面が使うエンドポイントです。スクリプトからの利用は想定しておらず、**Bearerトークンでは呼べません**（トークン自身でトークンを発行・失効することはできません）。Auth.jsのセッションCookieが必要で、未ログインは `401 loginRequired` です。

| メソッドとパス | 内容 | 応答 |
|---|---|---|
| `GET /api/tokens` | 一覧（新しい順）。ハッシュは返さない | `200 { tokens: [{ id, name, prefix, scope, createdAt, expiresAt, lastUsedAt }] }` |
| `POST /api/tokens` | 本文 `{ name, scope: "read" \| "write", expiresIn: 30 \| 90 \| 365 \| null }`（日数。`null` は無期限） | `201 { token: { … }, secret: "typle_…" }`。`secret` を返すのはこの1回だけ |
| `DELETE /api/tokens/{id}` | 失効（行の削除） | `204`。他人のトークンや存在しないIDは `404 tokenNotFound` |

`POST`・`DELETE` は、`Origin` ヘッダーが `AUTH_URL`（未設定ならリクエストURL）のオリジンと一致する必要があります。`POST` はさらに `Content-Type: application/json` が必要です。満たさないと `403 forbiddenRequest` です。そのほかのエラーは、本文の誤りが `400 invalidTokenRequest`、上限が `409 tokenLimit`、DBの障害が `503 databaseUnavailable` です。

## 範囲外

v1では次の操作はできません。

- 端末の作成・変更・削除
- 記録の削除・変更（追加だけ）
- 共有リンクのオン・オフ（共有中かどうかの読み取りだけ）
- 単語単位の追加・削除（`PATCH` の `words` で全体を置き換える）
- トークンの名前・権限・期限の変更（失効して作り直す）
- レート制限
- OAuthや第三者アプリの登録
