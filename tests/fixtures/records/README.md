# 練習記録の追加の共通 fixture

`lists`・`devices` のワークスペースで、`listId` のリストに `input` の記録を追加した結果が `expected` です。
記録の追加は Web（`/api/workspace/records`）とゲスト保存で同じ操作契約に従います。
TS は `tests/records.test.cjs`（`addRecord`）、Go は `server/internal/workspace/records_test.go`（`AddRecord`）が読みます。

- 成功したときは `expected.added`（新しく追加したか）と `expected.record`（保存された記録）。
- 拒否したときは `expected.error`（Go の `workspace.Error` のキー）。TS ではリストがないとき `recordListDeleted` になります。

## 守る約束

- revision を使わない。同じ `id` の再送は追加せず、保存済みの記録を返す。
- `device` は練習した時点の端末として、そのまま保存する（アプリの練習画面が送る。練習中に名前を変えたり削除したりしても、その時点の名前が残る）。
- `deviceId` は保存時に登録されている端末（`default` は組み込みの端末）に置き換える。見つからなければ拒否する。`device` と両方は送れない。
- `wordCount` がなければリストの単語数を使う。日時は `toISOString` の形で保存する。
- 1つのリストの記録は10000件まで（`recordLimit`）。
- `mode` は省くか `"recall"`（思い出して打った記録）か `"writing"`（Typle Handwriting の記録）だけ（省くと通常のタイピングの記録）。
  `null` を含むほかの値は `invalidRecord`。同じ `id` の再送でも、`mode` が正しくなければ拒否する。
