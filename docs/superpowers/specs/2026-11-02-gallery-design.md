# 単語パックのギャラリー 設計

- 日付: 2026-11-02
- 前提: v2.6.11。ログインしたユーザーはパックを共有リンク（`typle_shared_packs`、その時点の写し）で共有でき、リンクを開いた人は `/shared/<id>` で中身を見て「自分のパックに追加」（コピー）できる。管理者は FFPF ID でログインして `/admin` を使える

## 目的

練習する人が、公式パックにないテーマのパックを、ほかのユーザーが作って公開したパックから探して使えるようにする。

今の共有リンクはリンクを知っている人にしか届かない。ギャラリーは、作者が載せることにした共有を一覧・検索できるようにする。

## 決定事項

| 項目 | 決定 |
|---|---|
| 仕組み | 今の共有リンクに「ギャラリーに載せる」を足す。ギャラリーは掲載中で非公開にされていない共有の一覧。専用の写しは持たない |
| 載せられる人 | ログイン（クラウド保存）のユーザー。共有リンクと同じ |
| 掲載までの流れ | 作者が載せるとすぐ載る。閲覧者は通報でき、管理者が `/admin` で非公開にできる |
| 中身 | 共有リンクと同じ写し。「共有を更新」でギャラリーの中身も新しくなる |
| 作者 | 表示しない |
| 追加 | 今と同じコピー。公開元の更新は届かない |
| 見る人 | だれでも（ログインなし可）。検索エンジンには載せない（noindex） |
| 探し方 | キーワード検索（名前・説明・タグ）、カテゴリーの絞り込み、並べ替え（新しい順・追加の多い順）、`/shared/<id>` での下見 |
| 検索の実装 | PostgreSQL の `ILIKE` とページ送り。索引は作らない |
| ほかのアプリ | iPad・Mac アプリは変えない。`/api/shares` の変更は足すだけで互換 |

## 範囲外

- フォロー（公開元の更新が届く）
- 作者名・プロフィール、評価・コメント
- iPad・Mac アプリでのギャラリー
- 通報者への結果の連絡、非公開の理由の連絡と異議申し立て
- 検索エンジンへの掲載、`/api/v1` への追加
- 追加数・通報の水増しをコードで防ぐこと（Vercel Firewall のレート制限で抑える）

## データ

### マイグレーション `0033_gallery`

```sql
ALTER TABLE "typle_shared_packs"
  ADD COLUMN IF NOT EXISTS "listed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "add_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "typle_gallery_reports" (
  "id" UUID PRIMARY KEY,
  "share_id" UUID NOT NULL REFERENCES "typle_shared_packs" ("id") ON DELETE CASCADE,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "typle_gallery_reports_share" ON "typle_gallery_reports" ("share_id");
```

- `listed_at`: ギャラリーに載せた日時。NULL はリンクだけの共有。載せ直すと新しい日時になる
- `hidden_at`: 管理者が非公開にした日時。NULL でない共有は、ギャラリーにも `/api/shared` にも出ない（持ち主以外には共有が終わったのと同じに見える）
- `add_count`: ギャラリーに載っている間に「自分のパックに追加」された回数。「共有を更新」でも、掲載を外して載せ直しても消さない
- 通報の `reason` は `inappropriate`・`spam`・`personalInfo`・`other` のどれか。通報者の情報（アカウント・IP など）は保存しない
- 名前・説明・カテゴリー・タグは `data`（パックのファイルの JSON）から読む。列には写さない
- 共有をやめる・パックを消すと今と同じく行が消え、掲載・追加数・通報も一緒に消える

### 状態

| `listed_at` | `hidden_at` | ギャラリー | `/shared/<id>` |
|---|---|---|---|
| NULL | NULL | 出ない | 見られる |
| あり | NULL | 出る | 見られる |
| どちらでも | あり | 出ない | 404（`sharedPackNotFound`） |

非公開にされた共有は、持ち主が掲載を変えられない（`409 sharedPackHidden`）。「共有を更新」と「共有をやめる」はできる。

## API（Go、`server/internal/web`）

すべて今の `/api/shares`・`/api/shared` と同じ書き方（`methods`・`refuse`・`reply`）にする。

### 持ち主

- `PUT /api/shares` の本文に任意の `listed`（真偽値）を足す。
  - `{"packId"}` だけ（今のクライアント）: 今と同じく写しを作る・更新する。掲載は変えない
  - `{"packId","listed":true}`: 写しを作る・更新してから `listed_at` を今にする（すでに載っていれば変えない）
  - `{"packId","listed":false}`: 写しを更新してから `listed_at` を NULL にする
  - 非公開にされた共有で `listed` を送ると `409 sharedPackHidden`
- `GET /api/shares` の各行に `listed`（真偽値）と `hidden`（真偽値）を足す

### ギャラリー（認証なし。すべての応答に `X-Robots-Tag: noindex`、`Cache-Control: no-store`）

- `GET /api/gallery?q=&category=&sort=&page=`
  - `q`: 名前・説明・タグに部分一致（大文字小文字を区別しない）。前後の空白を除き、200文字で切る。空なら絞らない
  - `category`: パックのカテゴリーに完全一致。空なら絞らない
  - `sort`: `new`（既定。`listed_at` の新しい順）か `popular`（`add_count` の多い順、同じなら `listed_at` の新しい順）
  - `page`: 1 から。1ページ20件
  - 応答: `{ "packs": [{ "id", "name", "description"?, "category"?, "tags"?, "lists", "words", "added", "updatedAt" }], "more": bool }`
  - `sort`・`page` が不正なら `400 invalidQuery`
- `GET /api/gallery/categories` → `{ "categories": [{ "name", "count" }] }`（掲載中で非公開でない共有のカテゴリー。件数の多い順、同じなら名前の日本語の照合順）
- `POST /api/gallery/added?id=` → 掲載中で非公開でない共有なら `add_count` を1増やして `204`。そうでなければ何もせず `204`（ギャラリーに載っていないことを知らせない）。同じ Origin の確認をする
- `POST /api/gallery/reports` 本文 `{"id","reason"}` → 掲載中で非公開でない共有なら記録して `204`。掲載中で非公開でない共有がなければ `404 notInGallery`（リンクだけの共有の `/shared/<id>` から通報したとき「共有は終了しました」と出さないため）、`reason` が不正なら `400 invalidReport`。同じ Origin と `Content-Type` の確認をする

### 管理者（`/api/admin/*` の今の確認をそのまま使う）

- `GET /api/admin/gallery` → 掲載中か非公開の共有を、通報の多い順（同じなら新しい通報のある順）に。各行に id・名前・カテゴリー・追加数・掲載日・非公開日・通報の件数と理由ごとの件数
- `POST /api/admin/gallery/hide` 本文 `{"id"}` → `hidden_at` を今にする。`POST /api/admin/gallery/unhide` → NULL にする。どちらも共有がなければ `404 sharedPackNotFound`、本文が不正なら `400 invalidRequest`

### エラー

- DB に届かないときはどの API も `503 databaseUnavailable`
- 新しいエラーコード（`sharedPackHidden`・`invalidQuery`・`invalidReport`・`notInGallery`・`invalidRequest`）は `useErrorText` の文言に6ロケールで入れる
- 通報・追加数の連打は Vercel Firewall のレート制限で抑える。README の共有の節に設定を一文で書く

## 画面

### 公開する（単語パックの画面）

- 共有ダイアログに「ギャラリーに載せる」のスイッチを足す。オンにするとリンクがなければ作ってから載せる
- スイッチの下に「ギャラリーではだれでも見られます。作者名は出ません。不適切な内容は管理者が非公開にすることがあります」と出す
- カテゴリーのないパックには「カテゴリーを付けると見つけてもらいやすくなります」と出す（載せることはできる）
- 掲載の変更に失敗したらスイッチを元に戻し、理由を出す
- パックの行のバッジ: 「共有中」に加えて「ギャラリーに掲載中」。非公開にされたものは「非公開にされました」と出し、スイッチを押せなくする

### 探す（`/gallery`）

- `/shared/[id]` と同じく `(workspace)` の外に置き、ログインなしで開ける。メタデータは noindex
- 上に検索欄・カテゴリーの選択（`/api/gallery/categories`）・並べ替え（新しい順／追加の多い順）。条件は URL のクエリ（`q`・`category`・`sort`）に持つ
- カードに名前・説明・カテゴリー・タグ・リスト数・単語数・追加数。押すと `/shared/<id>`
- 20件ずつ「もっと見る」で次のページを足す
- 1件もないとき: 条件があれば「見つかりませんでした」、なければ「まだ公開されたパックはありません」
- 読み込みに失敗したら、`/shared` と同じエラー表示と「やり直す」
- 入り口: 公式パックのカタログ（`/packs/catalog`）の下と、サイドバーの単語パックの近く

### 下見と追加（`/shared/<id>`）

- 「自分のパックに追加」が成功したら `POST /api/gallery/added` を呼ぶ。応答は待たず、失敗しても何も出さない（掲載中かどうかはサーバーが判断する）
- 「通報」を足す。理由を4つから選んで送り、「通報を受け付けました」と出す。失敗したら理由を出す

### 管理者（`/admin`）

- 「ギャラリー」の欄を足す。`GET /api/admin/gallery` の一覧に、通報の件数と理由の内訳、`/shared/<id>` へのリンク、「非公開にする」「戻す」
- 非公開にした共有の `/shared/<id>` は管理者にも 404 になるため、一覧に名前とカテゴリーを出して判断できるようにする

### 文言

6ロケール（ja, en, zh-CN, zh-TW, ru, fr）すべてに同じキーを入れる（`tests/i18n.test.cjs`）。用語は「ギャラリー」（en gallery）。

## テスト

- Go（`store`・`web`、`TYPLE_TEST_DATABASE_URL` の DB）
  - `listed` のない `PUT /api/shares` が掲載を変えないこと、`listed` で載せる・外すこと、非公開で `409`
  - `/api/gallery` の `q`（日本語の部分一致・タグ）、`category`、`sort` の2種類、ページと `more`、不正な値で `400`
  - 非公開の共有が `/api/gallery`・`/api/gallery/categories`・`/api/shared` から消え、`GET /api/shares` に `hidden: true` で出ること
  - `added` が掲載中だけを数え、それ以外は何も変えないこと
  - 通報の記録、不正な理由で `400`、共有をやめると通報も消えること
  - 管理者 API が管理者以外に `403`
  - ギャラリーの応答すべてに `X-Robots-Tag: noindex`
- TS: ギャラリーの応答のデコード、URL のクエリと検索条件の変換
- E2E（Playwright）
  - ログインしてパックを載せる → ゲストで `/gallery` から検索 → 下見 → 追加 → 追加数が1増える
  - 通報 → 管理者が非公開にする → `/gallery` と `/shared/<id>` から消える → 持ち主の行に「非公開にされました」

## 進め方

PR を2つに分け、続けてマージする。

1. **ギャラリー**（v2.7.0）: マイグレーション `0033_gallery`（`typle_gallery_reports` を含む）、持ち主・ギャラリーの API、`/gallery`、追加数。画面から載せる操作はまだ作らない（通報の手段がない期間に載せられないようにするため）
2. **載せる・通報・非公開化**（v2.8.0）: 共有ダイアログのスイッチとパックの行のバッジ、通報と管理者の API、`/shared/<id>` の通報、`/admin` のギャラリー欄、README・`docs/features.md`・`docs/app-api.md`・ガイドの説明
