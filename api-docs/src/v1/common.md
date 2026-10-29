# 共通事項とエラー

## 応答

- 本文はJSON（`Content-Type: application/json; charset=utf-8`）、`Cache-Control: no-store` です。
- `GET /api/v1/lists/{l}/words.csv` は CSV ファイル、`GET /api/v1/packs/{p}/export` はパックのファイル（JSON）を、`Content-Disposition: attachment` を付けて返します。
- CORSヘッダーは付けないため、ブラウザーの他サイトからは呼べません。サーバーやスクリプトから利用してください。

## エラー

エラーは `{ "error": "<キー>" }` です。CSV・TSV の取り込みで行の分かる誤りには、`{ "error": "importQuote", "line": 3 }` のように `line`（1から数える行番号）が付きます。

| ステータス | キー | 状況 |
|---|---|---|
| 400 | `invalidQuery` | クエリの値が不正（`since`・`limit`・`tz`・`sort`・`order` など） |
| 400 | `invalidJson` | 本文がJSONの1つのオブジェクトでない、型が違う、未知の項目がある（項目名は大文字小文字まで一致が必要）、`PATCH` で変える項目が1つもない |
| 400 | `listNameRequired`・`listNameDuplicate`・`wordsRequired`・`wordFieldsRequired`・`invalidList`・`listLimit`・`levelsConflict`・`tooManyLevels` | リストの内容が不正（[リストの検証](./validation.md#リストの検証)） |
| 400 | `packNameRequired`・`packNameDuplicate`・`invalidPack` | パックの内容が不正（[パックの検証](./validation.md#パックの検証)。v0.95.0 から） |
| 400 | `packNotFound` | 本文やクエリの `packId` のパックがない（v0.95.0 から） |
| 400 | `packFileUnreadable` | 取り込むパックのファイルが読めない（[パックのファイルの取り込み](./validation.md#パックのファイルの取り込み)。v0.95.0 から） |
| 400 | `invalidRecord`・`recordLimit`・`deviceNotFound` | 記録の内容が不正（[記録の検証](./validation.md#記録の検証)） |
| 400 | `deviceNameRequired`・`deviceNameTooLong`・`deviceLayoutTooLong`・`deviceNameDuplicate`・`deviceLimit`・`invalidDevice` | 端末の内容が不正（[端末の検証](./validation.md#端末の検証)） |
| 400 | `importFileEncoding`・`importQuote`・`importHeaderRequired`・`importHeaderDuplicate`・`importHeaderUnknown`・`importNoRows`・`importTooManyRows`・`importColumnCount`・`importFieldRequired`・`importFieldTooLong` | 取り込むファイルが不正（[CSV・TSV の取り込み](./validation.md#csv・tsv-の取り込み)） |
| 401 | `invalidToken` | トークンがない、形式が違う、または GitHub が受け付けない |
| 404 | `listNotFound` | 指定したIDのリストがない |
| 404 | `packNotFound` | パスで指定したIDのパックがない（v0.95.0 から） |
| 404 | `deviceNotFound` | パスで指定したIDの端末がない（組み込みの `default` も） |
| 404 | `recordNotFound` | パスで指定したIDの記録がない（IDのない古い記録も） |
| 404 | `notFound` | 未知のパス |
| 405 | `methodNotAllowed` | そのパスで使えないメソッド（`-writable` でない書き込みを含む）。`Allow` に使えるメソッドを付ける |
| 409 | `packFollowed` | フォロー中の公式パックやそのリストを変えようとした（[フォロー中の公式パック](./write.md#フォロー中の公式パック)。v0.98.0 から） |
| 413 | `requestTooLarge` | 本文が 1MiB を超える |
| 413 | `importTooLarge` | 取り込むファイル（CSV・TSV・パックのファイル）が 1MiB を超える |
| 413 | `workspaceTooLarge` | 保存後のリスト全体が 896KiB を超える |
| 415 | `unsupportedContentType` | 書き込みの `Content-Type` の `;` より前が `application/json` でない（CSV・TSV の取り込みでは `text/csv`・`text/tab-separated-values`・`text/plain` のどれでもない） |
| 503 | `githubUnavailable` | GitHub でトークンを確かめられない。しばらくしてからやり直す |
| 503 | `databaseUnavailable` | DBの障害、または保存済みのデータが読めない。しばらくしてからやり直す |
