# 関心 設計

- 日付: 2026-10-27
- 対象バージョン: v0.99.0
- 前提: v0.98.2。公式パックはフォローで自分の一覧に入る。公式パックはカテゴリ（「プログラミング」「語学」）とタグを持つ

## 目的

ユーザーが「関心」を選べるようにし、公式パックのカタログで関心に合うパックを先に見せる。

- 関心はチップで複数選べる。親は「語学」「プログラミング」
- 親を選ぶと子のチップ（語学なら「中国語」「ロシア語」「韓国語」など）が開き、子も複数選べる

## 決定事項

| 項目 | 決定 |
|---|---|
| 使い道 | 公式パックのカタログを「関心に合うパック」「そのほかのパック」に分けて表示する |
| 保存先 | アカウント（DB の新しい列）。ゲストはブラウザーの保存データ |
| 画面 | 新しいページ `/interests`。サイドバーの「設定」グループに「一般」「関心」「端末」の順で置く |
| 子の選択肢 | 語学・プログラミングとも出す。コードに固定の一覧で持つ |
| ほかのアプリ・公開 API | 変えない。`/api/v1` には出さない |
| typle-kotlin-backend | 範囲外（README の約束どおり別リポジトリで Go と同じ変更を入れる） |

## 範囲外

- 関心だけを表示する絞り込みの切り替え
- 関心によるフォローの自動化、ホームや練習画面での利用
- 選択肢をユーザーが追加すること

## 選択肢

`src/core/interests.ts` に固定で持つ。ID は保存に使い、表示名は 6 言語の翻訳（`src/messages/*/interests.json`）。

| 親 ID | カテゴリ | 子 ID | タグ |
|---|---|---|---|
| `language` | 語学 | `language/zh` 中国語、`language/ru` ロシア語、`language/ko` 韓国語、`language/en` 英語、`language/es` スペイン語、`language/fr` フランス語、`language/de` ドイツ語 | 中国語、ロシア語、韓国語、英語、スペイン語、フランス語、ドイツ語 |
| `programming` | プログラミング | `programming/go` Go、`programming/kotlin` Kotlin、`programming/java` Java、`programming/typescript` TypeScript、`programming/php` PHP、`programming/ruby` Ruby、`programming/sql` SQL、`programming/linux` Linux、`programming/vim` Vim、`programming/test` テスト | Go、Kotlin、Java、TypeScript、PHP、Ruby、SQL、Linux、Vim、テスト |

今は公式パックのない言語も選べる。パックが増えれば、タグが合えば自動で関心に合う。

## 判定（関心に合うパック）

`matchesInterests(pack, interests)`。関心が空ならどのパックも「合う」とは扱わない（カタログは今の表示のまま）。

- 選ばれた親ごとに、その親の子が 1 つも選ばれていなければ: パックのカテゴリが親のカテゴリと同じなら合う
- 子が選ばれていれば: カテゴリが同じで、選ばれた子のタグのどれかをパックが持てば合う
- どれかの親で合えば合う。タグとカテゴリは大文字小文字を区別せず比べる（`normalizeLabels` と同じ比べ方）

## 選択の規則

- 子は、その親が選ばれているときだけ選べる。親を外すと、その子もすべて外れる
- 保存する配列の順は選択肢の順（親、その子…の順）に揃える
- 知らない ID（将来消した選択肢、新しいアプリが足した選択肢）は読み書きで消さずに残し、画面には出さない

## 保存形式

- マイグレーション `0026_interests`: `ALTER TABLE "typle_workspaces" ADD COLUMN "interests" JSONB;`（NULL は未設定 = 空）
- `WorkspaceDocument` に `interests: string[]`、`WorkspaceChange` に `interests?: string[]`（省略は変更なし）
- `PUT /api/workspace` の本文に `interests` を受け付ける。検証: 文字列の配列、50 個まで、1 つ 50 文字（UTF-16）まで、空文字・重複なし。違反は `400 invalidWorkspace`（既存の不正な本文と同じ扱い）
- `GET /api/workspace` の応答に `interests` を足す（未設定は `[]`）
- Go は列の読み書きと同じ検証を行う。`/api/v1` の応答には出さない
- ゲスト: LocalStorage のドキュメントに `interests` を足す（ないときは空）

## 画面

### `/interests`

- 見出し「関心」、説明「選んだ関心に合う公式パックを、公式パックの一覧で先に表示します。」
- 親チップ（`aria-pressed` のトグルボタン）を並べる。選ばれた親ごとに、その下に子チップの行を出す
- 押すとすぐ保存する（保存中はボタンを無効にし、失敗はエラーを出して元に戻す）
- 読み込み中はスケルトン、保存先のバッジは他の設定画面と同じ

### サイドバー

`src/components/Sidebar/navigation.ts` の `settings` グループに `{ name: "interests", path: "/interests" }` を「一般」と「端末」の間に足す（アイコンは `Sparkles`）。

### カタログ（`/packs/catalog`）

- 関心が空: 今のまま
- 関心がある: 「関心に合うパック」の見出しの下に合うパック、「そのほかのパック」の下に残りを、それぞれ今の順で並べる。合うパックがないときは「関心に合うパックはまだありません」と出す。関心の画面へのリンクを見出しの横に置く

## テスト

- コア（`node --test`）: 判定（親だけ、子あり、大小文字、関心が空）、選択の規則（親を外すと子も外れる、順の正規化、知らない ID を残す）、`interests` の読み込みと検証
- Go: 同じ検証、`Decode`・保存での読み書き、`PUT /api/workspace` の `interests`
- E2E: 関心で「語学 › 中国語」を選ぶ → カタログの「関心に合うパック」に中国語のパックが出る → 再読み込みしても選択が残る（ゲストとアカウント）

## リリース

- `package.json` を 0.99.0 にする
