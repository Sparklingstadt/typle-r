# 練習記録を独立したテーブルに保存する（#174 の計画2）

## 目的

練習記録をワークスペースの `lists` JSON から `typle_records` テーブルへ移し、記録の追加・変更で `lists` 全体を書き直さないようにする。
記録一覧はテーブルからページ単位で取得できるようにする。

## 変えないもの

- `/api/workspace` の通信形式。GET はこれまでどおり各リストの `records` に記録を入れて返し、PUT も記録を含むリストを受け取る。
  iPad・Mac・Android・Windows のアプリと、更新前のブラウザのタブはこの形式のまま動く。
- revision による競合検出。記録の追加・変更・削除も revision を進めるので、記録を知らない古い revision の PUT は 409 になり、記録を消さない。
- `lists` の大きさの上限（896KiB）は記録を含めた大きさで数える。アプリの `MAX_WORKSPACE_BYTES` と同じ意味を保つ。
- ゲスト保存（ブラウザの LocalStorage）はそのまま。

## スキーマ（`prisma/migrations/0031_records`）

```sql
CREATE TABLE typle_records (
  owner_id  text        NOT NULL,
  list_id   text        NOT NULL,
  record_id text        NOT NULL,
  position  integer     NOT NULL,  -- リストの records 配列での順番
  at        timestamptz NOT NULL,  -- 実施日時（date を読んだもの）。並べ替え・ページ取得用
  data      jsonb       NOT NULL,  -- 記録そのもの（id を含み、Typle の知らない項目も残す）
  PRIMARY KEY (owner_id, list_id, record_id)
);
CREATE INDEX typle_records_list_at ON typle_records (owner_id, list_id, at DESC);
ALTER TABLE typle_workspaces ADD COLUMN records_split boolean NOT NULL DEFAULT false;
```

- 一意制約は Issue の案の (ownerId, recordId) ではなく (ownerId, listId, recordId) にする。記録の追加の契約（`workspace.AddRecord`・`FindRecord`）は
  リストごとに id を比べており、プロファイルを統合した古いデータでは別のリストに同じ id があり得るため。再送の重複はリストごとに防げれば足りる。
- テーブルの追加と列の追加だけなので、旧アプリ（デプロイの切り替え中に動いている前のバージョン）と互換性がある。

## 移行（行ごとに、書き込みのとき）

`records_split` が false の行は、記録が `lists` JSON にある（これまでどおり）。新しいサーバーがその行に記録を含めて書き込むとき
（`PUT /api/workspace` のリスト保存、`/api/v1` と `/api/workspace/records` の変更）、同じトランザクションで記録をテーブルへ移し、
`lists` には空の `records` を書き、`records_split` を true にする。新しく作る行は最初から true。

ワークスペースの行を作るときは、その所有者のテーブルの行を消す（行だけが削除されたときに残った記録が、同じ id の新しいリストに出ないように）。

一括の移行処理は置かない。書き込みのない行は JSON のまま読まれ、どちらの形でも同じ結果を返す。

### IDのない記録

古いアプリが保存した記録には `id` がないことがある（`FindRecord` はそれらを見つけない）。テーブルへ移すとき `legacy-` に、リストID・位置・`date`・`time` の SHA-256 の先頭20桁を付けた ID を与え、
`data` にも書く。同じ記録からは何度でも同じ ID になる（ロールバックして移し直しても変わらない）。同じリストに同じ id の記録が2つあるときは、
後のものに同じ方法で ID を与える。ID を得た記録は、以後どのクライアントにも `id` 付きで返る。

## 読み込み

`records_split` が true の行は、一つの SELECT で行とその記録（`list_id`・`position` 順）を読み、各リストの `records` に入れてから `workspace.Decode` する。
デプロイの切り替え中に旧サーバーが `lists` に記録を書いた場合も失わないように、`lists` に残っている記録を先に、テーブルの記録を後に並べる
（同じ id はテーブルのものを使う）。次の書き込みでそれらもテーブルへ移る。

`GET /api/v1/lists/{l}/records` は、行が移行済みで、そのリストが保存されたリストにあり、`lists` に記録が残っておらず、公式パックのリスト（`origin` あり）でなければ、
テーブルから `at` の新しい順に `since`・`limit` で読む。それ以外はこれまでどおりワークスペース全体から求める。

## 書き込み

保存するワークスペースの記録から（リストID, 記録ID, 位置, 日時, data）の行を作り、読み込んだときの行と比べて、
なくなった行を削除し、増えた行・変わった行だけを書く。記録の追加なら INSERT 1行と `lists` の書き直しになる
（`lists` は記録を含まないので小さい）。`PUT /api/workspace` は保存済みの記録を Go で読み直していないので、送られた全行を
`ON CONFLICT ... DO UPDATE ... WHERE IS DISTINCT FROM` で書き、変わらない行は更新しない。

## 照合

移行するトランザクションの中で、テーブルへ書いた行数が JSON の記録数と一致することを確かめ、違えばトランザクションを中止する（保存は 503 になり、データは変わらない）。
DB テストで、移行前後に GET・`/api/v1` が同じ記録を返すこと、記録の追加・削除・並べ替え・リスト削除がテーブルに反映されることを確かめる。

## ロールバック

前のバージョンに戻すときは、戻す前に `scripts/records-rollback.sql` を本番 DB に実行する。テーブルの記録を各リストの `records` に戻し
（`lists` に残っている記録の後ろに、同じ id は除いて）、`records_split` を false にして revision を進め、テーブルの行を消す。
テーブルと列は残るが、前のバージョンは使わない。このスクリプトも DB テストで実行して確かめる。

## 段階

1. （この PR）テーブル・行ごとの移行・読み書き・ページ取得・ロールバックスクリプト。
2. 計測後、必要なら一括移行、`/api/workspace` で記録を送らない形式（新しいクライアント用）、`lists` から `records` 項目をなくすことを検討する。
