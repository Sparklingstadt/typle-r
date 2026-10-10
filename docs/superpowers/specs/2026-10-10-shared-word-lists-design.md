# 単語リストの共有（リンク共有）設計

- 日付: 2026-10-10
- 対象バージョン: v0.31.0（機能追加）

## 目的

ログインユーザーが自分の単語リストを「共有する／しない」で切り替え、共有したリストを全ユーザーで一意な id を持つリンクで渡せるようにする。リンクを開いた人（未ログインでも可）は、そのリストを自分のリストとしてコピーし、独立して編集・練習できる。

## 決定事項

| 項目 | 決定 |
|---|---|
| 見つけ方 | リンク（`/shared/<shareId>`）を知っている人だけ。公開一覧は作らない |
| コピーの扱い | コピーした時点の内容で独立する。元の変更・削除は反映しない |
| 共有を設定できる人 | クラウド保存（GitHubログイン）のユーザーのみ |
| リンクを開く・コピーする人 | 誰でも（未ログイン可）。コピー先は今の保存先・今のプロフィール |
| 保存方式 | 共有用の専用テーブル。持ち主の保存と同じトランザクションで自動同期 |
| 共有 id | サーバーが発行するUUID。クライアントは指定できない |

既存のリスト id はワークスペース内でしか一意でない（初期リストは全ユーザーで `sample-1` などの同じ id）ため、共有には別の id を使う。

## 範囲外

- 公開一覧・検索
- 共有者の表示名、閲覧数・コピー数
- コピー元の更新をコピーに取り込む機能
- 共有 id の再発行（OFF→ON で新しいリンクになる）
- コピーせずに共有リストで練習すること
- ブラウザー保存（未ログイン）のリストの共有

## データ

### ワークスペース内のリスト

`src/core/wordLists.ts` の `WordList` に次を追加する。

- `shared?: true` — 持ち主が共有を ON にしている。ワークスペースの JSON に保存する。
- `shareId?: string` — 読み取り専用。`GET /api/workspace` の応答でだけ付く。サーバーは書き込み時にクライアントから届いた `shareId` を捨て、ワークスペースの JSON には保存しない。

`decodeLists` は `shared` が `true` か未指定であることを検証する。`shareId` は文字列か未指定であることを検証する。

リスト編集の保存（`saveList`）は `shared` を保持する。複製（`duplicateList`）は `shared` を引き継がない。

### 共有テーブル（マイグレーション `0004_shared_lists`）

```sql
CREATE TABLE "typle_shared_lists" (
  "share_id"   UUID        PRIMARY KEY,
  "owner_id"   TEXT        NOT NULL,
  "profile_id" TEXT        NOT NULL,
  "list_id"    TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "words"      JSONB       NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE ("owner_id", "profile_id", "list_id")
);
CREATE INDEX ON "typle_shared_lists" ("owner_id");
```

`prisma/schema.prisma` に `SharedList` モデル（`@@map("typle_shared_lists")`）を追加する。練習記録は共有テーブルに入れない。

## サーバー

### 保存時の同期（`src/plugins/storage/cloud/repository.ts`）

`write` はワークスペースの更新と共有テーブルの同期を1つのトランザクション（`$transaction`）で行う。

1. これまでどおり revision を比較してワークスペースを更新する。古い revision なら `null` を返し、共有テーブルも変更しない。
2. 更新後の文書（`applyChange` の結果）の全プロフィールから、`shared: true` のリストの `(profileId, listId)` を集める。
3. その持ち主の共有行のうち、集合に含まれないもの（共有 OFF、リスト削除、プロフィール削除）を削除する。
4. 集合に含まれるリストは、行がなければ新しい UUID で作成し、あれば `name`・`words`・`updated_at` を更新する。`share_id` は変えない。

`read` と `write` の戻り値では、その持ち主の共有行を引き、表示中のプロフィールのリストに `shareId` を付ける。

### 公開 API `GET /api/shared/[id]`（`src/app/api/shared/[id]/route.ts`）

- 認証は不要。
- `id` が UUID の形でなければ 404 `{ error: 'sharedListNotFound' }`。
- `share_id` で1行を引く。なければ 404。
- あれば `{ name, words, updatedAt }` を返す。`owner_id`・`profile_id`・`list_id` は返さない。
- `Cache-Control: no-store`（共有 OFF を即時に反映するため）。
- DB エラーは Sentry に送り、503 `databaseUnavailable`。

### 既存 API の変更

- `validateLists`（`src/core/workspaceRequest.ts`）は `shareId` を取り除いてから検証・保存する。
- 共有の切り替えは通常のワークスペース保存の一部なので、revision による競合検出はそのまま働く。

## core（`src/core`）

- `copySharedList(lists, shared, copyId, suffix, now)` — 共有リスト `{ name, words }` から新しいリストを作る。新しい id、`createdAt` は今、`records: []`、`shared` なし。名前が重複するときは `copyName` で番号を付ける。`lists.length >= MAX_LISTS` なら `AppError('listLimit')`。
- `decodeSharedList(value)` — 公開 API の応答を検証する。不正なら `AppError('invalidServerData')`。
- `isShareId(value)` — UUID の形かを判定する（API とページで共用）。

## 画面

### 共有する人（`/edit`）

- `ListRow` の「…」メニューに「共有…」を追加する。
  - クラウド保存のとき：押すと `ShareDialog`（`src/components/WordLists/ShareDialog.tsx`、新規）を開く。
  - ブラウザー保存のとき：無効にし、「ログインすると共有できます」と表示する。
- 共有中のリストは名前の横に「共有中」バッジを出す。
- `ShareDialog`
  - チェックボックス型のスイッチ「リンクを知っている人に公開」。切り替えるとすぐに `update()` でリストの `shared` を変えて保存する。保存中はスイッチを無効にする。失敗したら既存の保存エラー表示を使う。
  - ON のときは共有リンク（`location.origin + /shared/<shareId>`）を読み取り専用の入力欄に出し、「リンクをコピー」ボタン（`navigator.clipboard.writeText`、成功したら「コピーしました」）を置く。保存直後で `shareId` がまだないときは読み込み中の表示にする。
  - 補足文：「コピーした人のリストには、あとの変更は反映されません。練習記録は公開されません。」
- 共有中のリストの削除確認に「共有リンクも無効になります」を追加する。

### リンクを開いた人（`/shared/[id]`）

- `src/app/(workspace)/shared/[id]/page.tsx` に置く。ワークスペースのレイアウトの下なので、`useWordLists()` が使える。
- `/api/shared/<id>` を取得し、リスト名・単語数・単語の一覧（表示・入力・補足）と保存先バッジを出す。
- 「自分のリストにコピー」ボタンは `update(lists => copySharedList(...).lists)` で、今のプロフィールに追加する。成功したら保存完了の通知を出し、`/edit?list=<新しい id>` に移動する。上限や保存失敗のエラーはその場に表示する。
- 404 なら「このリストは共有されていないか、削除されました」と表示する。
- サイドバーには項目を追加しない。

### 文言

追加する文言は6言語すべて（`ja`・`en`・`zh-CN`・`zh-TW`・`ru`・`fr`）の `src/messages/<言語>/` に入れる（`wordLists.json`・`errors.json`、共有ページ用の新しい `shared.json`）。`tests/i18n.test.cjs` を通す。

## テスト

- 単体（`tests/wordLists.test.cjs`・`tests/listOverview.test.cjs`）
  - `shared`・`shareId` の検証
  - `saveList` が `shared` を保持し、`duplicateList` が引き継がない
  - `copySharedList`：新しい id、空の記録、名前の番号付け、上限
  - `validateLists` が `shareId` を取り除く
- リポジトリ（`tests/workspace.test.cjs`、実 DB）
  - 共有 ON で行が作られ、応答のリストに `shareId` が付く
  - 編集で名前・単語が更新され、`shareId` は変わらない
  - 共有 OFF、リスト削除、プロフィール削除で行が消える
  - 他の持ち主の行に影響しない
  - 古い revision の保存は共有テーブルを変えない
  - クライアントが送った `shareId` は保存されない
- API：`/api/shared/[id]` が `{ name, words, updatedAt }` だけを返す。不正な形の id と存在しない id は 404
- E2E（`tests/e2e/sharing.spec.ts`）：ログインユーザーが共有 ON → リンク取得 → 未ログインのコンテキストで開いてコピー → `/edit` に追加され練習できる → 持ち主が共有 OFF → リンクが「共有されていない」表示になる

## リリース

`package.json` を 0.31.0 にし、README に共有の説明を加え、`docs/release-workflow.md` の手順どおり PR で出す。
