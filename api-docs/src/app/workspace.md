# ワークスペースと記録

ログインしたアカウントの単語リスト・パック・端末・関心（`typle_workspaces`）と練習記録（`typle_records`）を読み書きします。どれもログインが必要です。

## `GET /api/workspace`

```json
{
  "lists": [ … ],
  "packs": [ … ],
  "devices": [ … ],
  "interests": ["language", "programming/go"],
  "revision": 12,
  "accountId": "github:123"
}
```

- `lists`・`packs`・`devices`・`interests` は保存されている jsonb をそのまま返します（Typleの知らない項目も含む）。Go は読み込めるか確かめるだけで、形が合わないデータは画面が `savedDataCorrupted` として扱います。
- フォロー中の公式パックのリストは `words` が空です（v2.1.0 から。それより前に保存したデータは次の保存で空になります）。単語はアプリに同梱のカタログにあり、画面が読み込むたびにカタログに合わせて戻します。
- `packs` はパックができる前に保存したアカウントと、一度も保存していないアカウントでは `null` です。
- `interests` は保存していなければ、すべての選択肢（`DEFAULT_INTERESTS`。`tests/fixtures/default-interests.json`）です。
- 一度も保存していないアカウントは、`lists`・`devices` が `[]`、`revision` が `0` です。

## `PUT /api/workspace`

本文はJSONのオブジェクトで、1MiB までです。応答は `GET` と同じ形の保存後のワークスペースです。

| 項目 | 内容 |
|---|---|
| `accountId` | 必須。ログイン中のアカウントと違えば、ほかより先に `401 loginAccountChanged` |
| `revision` | 必須。読み込んだときの `revision`（0以上の整数。`Number.isSafeInteger` の範囲）。保存のたびに1増える。保存済みと違えば `409 conflict` で、画面は読み込み直す。`0` は行を作る |
| `lists` | 省略すると保存済みのまま |
| `packs` | `lists` と一緒のときだけ。`lists` だけ送ると、各リストを1リストのパックに入れる |
| `devices` | 省略すると保存済みのまま |
| `interests` | 文字列の配列（50個まで、1つ1〜50文字、重複なし）。省略すると保存済みのまま。`null` はなし |

- `lists`・`packs`・`devices` の `null`、`packs` だけの本文、パックより前の形（`profileId`・`profiles`）は `400 invalidWorkspace` です。
- PostgreSQL の jsonb に保存できない文字（`\u0000`、対になっていないサロゲート）は、知らない項目にあっても `400 invalidWorkspace` です。
- 同じパックのリストで難易度が重なると `400 levelsConflict`、自作のリスト（フォローした公式パックのリストを除く）が150件を超えると `400 listLimit`、フォローした公式パックが200個を超えると `400 followLimit`（どちらも保存済みの数より増えるときだけ）、ほかの検証の誤りは `400 invalidWorkspace` です。1つのリストに2つ以上の難易度があっても拒否せず、1つにまとめて保存します。
- 検証の規則は [リストの検証](./validation.md#リストの検証) にあります。
- フォロー中の公式パックのリストは、送られた単語によらず単語を空にして保存します（v2.1.0 から）。アプリは保存のときも単語を送りません。

## 記録の追加と削除

`POST /api/workspace/records`・`DELETE /api/workspace/records` は、練習画面の記録の追加と、記録画面の削除です（v1.2.0・v1.4.0 から）。`server/internal/operation` の `AddRecord`・`DeleteRecord` で、`revision` を使わないため、別の画面でリストを編集していても拒否されません。同じ本文で送り直しても結果は同じです。

| メソッド | 本文 | 応答 |
|---|---|---|
| `POST` | `{ "accountId", "listId", "record": { "id", "time", "date", "mistakes", "accuracy", "wordCount"?, "mode"?, "missed"?, "deviceId"? \| "device"? } }` | 追加したら `201`、同じリストに同じ `id` があれば追加せず `200`。どちらも保存後のワークスペースに `record` を足したもの |
| `DELETE` | `{ "accountId", "listId", "recordId" }` | `200` と保存後のワークスペース。記録やリストがすでになくても `200` |

- 本文のほかの項目と、`record` の知らない項目は `400 invalidRecord` です。`record.id` は必須です。
- 追加先のリストがなければ `404 recordListDeleted`、記録の検証の誤りは `400` と検証のキー（[記録の検証](./validation.md#記録の検証)）です。
- 端末は `deviceId`（追加する時点で登録されている端末として保存）か、`device`（`{ "id", "name", "layout" }`。練習した時点の端末としてそのまま保存。アプリはこちらを送ります）のどちらかで指定します。

::: tip 機械で読める定義
本文・応答・エラーコードは [OpenAPI 3.1 の定義](/openapi.md) にあり、Go のハンドラとアプリの両方をテストでこの定義と照合しています（v1.6.0 から）。
:::
