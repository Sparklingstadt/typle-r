# 公式パックのフォロー 共通 fixture

1 ファイル 1 ケース。形は次のとおりです。

```json
{ "official": [OfficialPack], "library": { "lists": [...], "packs": [...] | null }, "expected": { "lists": [...], "packs": [...] } }
```

`library` に `normalizeLibrary`（Go は `workspace.Decode`）をかけ、続けて `followOfficial(_, official)`（Go は同期）をかけた結果が `expected` です。
もう一度かけても変わりません。TS は `tests/followedPacks.test.cjs`、Go は `server/internal/workspace` のテストが読みます。

- `official` は小さな架空のカタログ。各エントリは `{ catalogId, version, pack, lists }` で、`pack` と `lists` は保存された形（`lists` の `packId` は公式パックの `id`、`records` は空、`createdAt` あり）。

## 守る約束

- 移行: `origin` があり `origin.followed` がないパック、`origin` がなく `id` が公式の `catalogId` と同じパックを、リスト・記録ごと消す。
- 同期: `origin.followed` のあるパックごとに `origin.catalogId` の公式パックを探す。
  - ない: パックをリスト・記録ごと消す。
  - ある: `description`・`category`・`tags` を公式の値にする（公式にないものは項目ごと除く）。`name`・`id`・`createdAt`・`origin` は変えない。
- リストは公式の順に並べ直す。`origin.listId` が同じリストがあれば（先に出たもの 1 つだけ）`name`・`levels`・`words` を公式の値にし（公式に `levels` がなければ除く）、`id`・`createdAt`・`records`・`origin` は残す。
  なければ新しいリスト `{ id: "<パックの id>:<公式のリストの id>", name, levels?, packId, words, records: [], createdAt: 公式の createdAt, origin: { listId } }` を作る。
- 公式にない `origin.listId` のリストと `origin` のないリストは記録ごと消す。
- ライブラリ全体のリストの並びでは、フォロー中のパックのリストを、そのパックの最初のリストがあった位置にまとめて置く。パックの並びは変えない。
- 名前の比較・長さは `wordPacks` の fixture（`tests/fixtures/packs/README.md`）と同じ。
