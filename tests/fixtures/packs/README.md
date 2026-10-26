# 単語パックの共通 fixture

入力 `lists`・`packs` に `normalizeLibrary`（Go は `workspace.Decode`）をかけた結果が `expected` です。
TS は `tests/wordPacks.test.cjs`、Go は `server/internal/workspace/packs_library_test.go` が読みます。

- `packs` が `null` のときは未変換のデータで、`group` ごとにパックを作ります。
- `packs` があるときは変換済みのデータで、読み込み時の補正だけをかけます。
