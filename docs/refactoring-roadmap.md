# リファクタリングのロードマップ

2026-11-06 時点（v2.36.0）のコードを棚卸しして、直す順番を決めたものです。機能の開発と並行して進められるよう、1項目を1つの PR にし、どれも見た目と動作を変えません。進めた項目は表の「状態」を更新し、終わったらこのファイルから消します。

## 今の状態

良いところは守ります。

- `src` の層（画面 → プラグイン → core）は `eslint.config.mjs` が守り、`src/core` は React・Next.js・ブラウザー API に依存していません。
- `any`・`@ts-ignore`・`TODO` はなく、`eslint-disable` は `session.tsx` の3か所だけです。
- 1ファイル 200 行以下を目安に、v2.24.1 から v2.33.4 までの PR で画面の分割と `ui/` への共通化が進みました（`docs/superpowers/plans/2026-11-04-frontend-split.md`・`2026-11-04-shared-ui.md`）。
- 単体テスト 375 件（`tests/*.test.cjs`）、Go のテスト 531 件、E2E 38 ファイル。公式パック・記録の操作列・バックエンドのパス・Cookie は TS と Go で同じ fixture（`tests/fixtures`）から照合しています。

負債は次の6つにまとまります。

| 種類 | 何が残っているか |
|---|---|
| コード | 分割の途中（旧 `Page`／`PageContainer` が3ファイルに残る）、`cn` の import が3通り、使っていない `ui/` の部品が2つ、200 行を超える画面が4つ |
| アーキテクチャ | 単語リスト・パック・CSV・パックファイルの規則が TS（`src/core`）と Go（`server/internal/workspace`）の両方にあり、上限値と CSV は照合のテストがない。API の入口が REST（iPad・Mac アプリ）・GraphQL（Web）・`/api/v1`（トークン、手元専用）の3つ |
| テスト・検査 | Go は `gofmt`・`go vet` だけで静的解析がない。使っていないファイル・export を見つける仕組みがなく、カバレッジも測っていない |
| 依存 | Prisma は移行にしか使っていないのに `@prisma/client`・`@prisma/adapter-pg` が本番の依存で、`prisma generate` が install と build のたびに走る。`@sentry/nextjs`・`lucide-react`・`radix-ui` が範囲内で古い。ESLint 10・TypeScript 7 のメジャーが出ている |
| 文書 | `docs/superpowers/plans` に、今はない構成（Next.js の Route Handler・Auth.js）を前提にした計画が残っている。`docs/design` のレビューは分割の前の画面のもの |
| 開発環境 | `npm run lint` が `.claude/worktrees` のビルド出力を拾う。手元に 74 本のブランチと、main から大きく遅れた worktree が3つ |

## 優先順位

影響（開発をどれだけ遅くするか）・危険（放っておくと何が起きるか）を 1〜5、手間を 1（小）〜5（大）で付け、優先度 = (影響 + 危険) × (6 − 手間) です。高い順に並べています。

| # | 項目 | 影響 | 危険 | 手間 | 優先度 | 段階 |
|---|---|---|---|---|---|---|
| 1 | TS と Go の上限値と CSV の照合テスト | 3 | 4 | 2 | 28 | 2 |
| 2 | 旧 `Page`／`PageContainer` を `PageMain`／`PageHeader` に置き換えて消す | 2 | 2 | 1 | 20 | 0 |
| 3 | Prisma を移行専用にし、本番の依存から外す | 2 | 2 | 1 | 20 | 0 |
| 4 | Go に `staticcheck` を入れ、CI の `verify` で動かす | 2 | 2 | 1 | 20 | 1 |
| 5 | 200 行を超える画面の分割（`guide`・`HandwritingPad`・`Dashboard`・`admin-dashboard`） | 2 | 2 | 2 | 16 | 2 |
| 6 | 古い計画を `docs/superpowers/plans/archive` へ移す | 1 | 2 | 1 | 15 | 1 |
| 7 | `npm run lint` が `.claude` を無視するようにする | 2 | 1 | 1 | 15 | 0 |
| 8 | 使っていないファイル・export の検出（`knip`）を CI に入れる | 2 | 1 | 1 | 15 | 1 |
| 9 | 範囲内の依存の更新を1つの PR にまとめる（月に1回） | 1 | 2 | 1 | 15 | 1 |
| 10 | CI の `verify` を Node・Go・E2E の並列ジョブに分ける | 2 | 1 | 2 | 12 | 3 |
| 11 | `/api/v1`（`typle-api`）の行く末を決める | 2 | 2 | 3 | 12 | 3 |
| 12 | `cn` の import を1つにそろえ、lint で固定する | 1 | 1 | 1 | 10 | 0 |
| 13 | 使っていない `ui/TextField.tsx`・`ui/button-group.tsx` を消し、`tests/refactoring.test.cjs` を中身の名前にする | 1 | 1 | 1 | 10 | 0 |
| 14 | 単体テストのカバレッジを CI で出す | 1 | 1 | 1 | 10 | 1 |
| 15 | 手元のブランチと worktree の片付け | 1 | 1 | 1 | 10 | 0 |
| 16 | `prisma migrate` を SQL だけの移行に置き換える | 1 | 3 | 4 | 8 | 3 |

## 段階

### 段階 0：小さな片付け（1〜2週間、1項目1 PR）

どれも半日以内で、機能の PR の合間に入れられます。

- **#2 ページの外枠** — `src/app/(workspace)/play/page.tsx`・`src/app/home/page.tsx`・`src/app/admin/admin-dashboard.tsx` が旧 `components/Page/Page.tsx`・`components/PageContainer` を使っています（ほかの 17 ファイルは `ui/page-layout.tsx` の `PageMain`／`PageHeader`）。3ファイルを置き換え、旧 `Page`・`PageContainer` を消します。#264 を取り消した経緯（v2.31.2）があるので、クラスの集合が変わらないことを E2E で確かめます。
- **#3 Prisma** — `@prisma/client`・`@prisma/adapter-pg` を import しているコードは `src` にも `scripts` にもなく、`scripts/migrate.cjs` が `prisma` の CLI と `pg` を使うだけです。`@prisma/client`・`@prisma/adapter-pg` を外し、`postinstall`・`prebuild` から `prisma generate` を外します。`prisma`・`pg` は移行のために残します。`scripts/generate-licenses.cjs` が作るライセンス一覧（`/about/licenses`）から Prisma が消えるので、`tests/licenses.test.cjs` を合わせます。本番の `db:migrate` の流れは変えません。
- **#7 lint** — `eslint.config.mjs` の `globalIgnores` に `.claude/**` を足します。今は計画の文書が「`npm run lint` は使わず `npx eslint src tests` で」と案内しており、CI と手元で違う検査になっています。`tsconfig.json` は `.claude/worktrees` を読んでいないことを確認済みです。
- **#12 `cn`** — `import { cn } from "cn"` が 20 か所、`from "@/lib/utils"`（`cn` を再 export）が 34 か所です。`ui/` は `"cn"`、画面は `@/lib/utils` に寄っているので、どちらかに決めて `no-restricted-imports` で固定します。
- **#13 不要なファイル** — `src/components/ui/TextField.tsx`・`src/components/ui/button-group.tsx` はどこからも import されていません。`tests/refactoring.test.cjs` は記録の並びとクラウド転送のテストなので、`cloudClient.test.cjs` のような名前にします。
- **#15 ブランチと worktree** — `typle-r-recall`（`feat/recall-mode`、main より 85 コミット遅れ）、`typle-r-refocus`（`feat/words-show-display`、70 遅れ）、`.claude/worktrees/front-refactoring-0f203a`（split-1〜4 で置き換え済み）は、取り込んでいない変更がないことを確かめてから消します。squash merge のため `git branch --merged` では判定できないので、PR の番号で突き合わせます。

### 段階 1：検査の仕組み（2〜4週間）

機能を変えずに、以後の PR が負債を増やさないようにします。

- **#4 `staticcheck`** — `.github/workflows/ci.yml` の「Check Go API」に `staticcheck ./...` を足します。最初の実行で出た指摘は同じ PR で直すか、`//lint:ignore` に理由を書きます。
- **#8 `knip`** — 使っていないファイル・export・依存を CI で落とします。#13 で消す2ファイルのようなものを、以後は手で探さなくて済みます。Next.js の規約ファイル（`page.tsx`・`layout.tsx`・`sitemap.ts` など）と `src/i18n/request.ts`（next-intl のプラグインが既定のパスで読む）は入口として登録します。
- **#9 依存の更新** — `npm outdated` の「Wanted」の範囲（`@sentry/nextjs` 11.11、`lucide-react` 1.69、`radix-ui` 1.8、`@playwright/test` 1.65 など）を1つの PR にまとめ、E2E で確かめます。メジャー（ESLint 10・TypeScript 7・`@types/node` 26・`cn` 0.5）は1つずつ別の PR にします。Prisma 8 は RC のうちは上げません。
- **#14 カバレッジ** — `npm test` に `--experimental-test-coverage` を足して CI のログに出します。しきい値は決めず、まず数字を見ます。
- **#6 古い計画** — `docs/superpowers/plans/2026-10-10-typle-api.md` は Next.js の Route Handler・Prisma・Auth.js を前提にしていますが、バックエンドは v0.55.0 から Go です。実装の終わった計画は `archive/` に移し、先頭に「この計画は実装済みで、構成は README を見ること」と書きます。`docs/design/*-review.md` は、分割後の画面と合っているかを1ページずつ確かめ、合わないものは直すか消します。

### 段階 2：規則の二重化を押さえる（1〜2か月）

TS と Go の両方に規則があるのは、ゲストのデータをブラウザーで読み書きし、アカウントのデータを Vercel の Go の関数で守るためで、片方にまとめることはできません。できるのは「同じ入力に同じ答えを返すこと」をテストで固定することです。

- **#1 上限値と CSV の照合** — 上限値は TS（`src/core/wordLists.ts` の `MAX_CATEGORY = 50` など）と Go（`server/internal/workspace/encode.go` の `MaxCategory = 50` など）に別々に書かれ、どちらかを変えても気づけません。公式パックと同じく `tests/fixtures` に1つの JSON（上限値の表）を置き、両方のテストがそれを読むようにします。CSV・TSV（`src/plugins/formats/delimited.ts` と `server/internal/workspace/delimited.go`）も、入力と期待する結果の fixture を共有します。`validateList`／`checkLabels` のような検証も同じ形で足せます。
- **#5 残りの大きい画面** — `src/app/guide/page.tsx`（267 行）は節ごとの部品に、`src/components/Practice/HandwritingPad.tsx`（245 行）は canvas の描画と認識の呼び出しを `src/lib` のフックに、`src/components/Dashboard/Dashboard.tsx`（196 行）と `src/app/admin/admin-dashboard.tsx`（175 行）はカードごとの部品に分けます。進め方は `2026-11-04-frontend-split.md` の制約（E2E と `messages` を変えない、クラスと `data-*` を変えない）に従います。

### 段階 3：決めてから進めるもの

設計の判断が要るので、着手の前に決めます。

- **#11 `/api/v1`** — `server/internal/api`（1,355 行、テスト 1,427 行）は手元の `typle-api` 専用で、Vercel には載せていません。Web は v2.14.0 から GraphQL、iPad・Mac は REST を使っています。iPad・Mac が GraphQL へ移れば REST の HTTP の包み（`server/internal/web` の各ハンドラー）を減らせます。`/api/v1` は、使う人がいるなら `api-docs` で保証する範囲を書き、いないなら消します。
- **#10 CI の並列化** — `verify` は今、移行・Go・型・単体・lint・build・文書・E2E を1本で流しています。Node 側（型・単体・lint・build）、Go、E2E に分けると PR の待ち時間が減りますが、`release` の条件（`verify` の成功）と `docs/release-workflow.md` の説明を一緒に直す必要があります。`claude/faster-ci` ブランチに途中の作業があるので、まずそれを見ます。
- **#16 移行の道具** — #3 のあとも `prisma migrate deploy` が本番の移行を流します。SQL だけの移行（Go の `migrate` か、`pg` で `_prisma_migrations` 互換の表を読む小さなスクリプト）に置き換えれば Prisma への依存がなくなりますが、本番の DB の流れを変えるので、0002 の失敗（2026-10-31）のような事故の手順を先に書いてから進めます。急ぎません。

## 進め方の約束

- 1 PR に1項目。機能の変更と混ぜず、バージョンはパッチを上げます（`CLAUDE.md` の Release workflow）。
- リファクタリングの PR では `tests/e2e/` と `src/messages/` を変えません。変えたくなったら動作が変わった合図です。
- 新しいファイルは 200 行以下。処理は書き換えずに移し、見つけたバグは直さずにこのファイルか Issue に記録します。
- 段階 0 と 1 は順不同で、段階 2 は段階 1 の検査が入ってから始めます。
