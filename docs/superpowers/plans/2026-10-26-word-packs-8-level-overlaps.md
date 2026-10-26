# 単語パック 8: 難易度の重なりをなくす Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 1 つのパックに、同じ難易度や途中まで同じ難易度のリストが並ばないようにする。

- 既存データの重なりは、読み込むときに直す。
- 新しい重なりは、サーバーでも保存を拒否する。

**Architecture:** 読み込み時の補正（TS の `repairLibrary`/`convertLibrary`、Go の同名の関数）の最後に `separateLevels` をかけ、重なったリストの難易度（難易度がなければ名前）に「（2）」などを付けて分ける。補正は TS と Go で同じ結果になるよう、共通 fixture（`tests/fixtures/packs/`）で確かめる。`PUT /api/workspace` で packs を送る保存は、`CheckPacks`（Go）で重なりを `400 levelsConflict` にする。lists だけの保存（パックを知らない古いアプリ）は拒否せず、読み込み時の補正に任せる。

**Tech Stack:** TypeScript (src/core), Go (server/internal/workspace, web), Kotlin (../typle-kotlin-backend)

**Spec:** ユーザーの依頼（2026-10-26）。「1 つの単語パックに同じ難易度、たとえば『初級』が 2 つある、または『中級1』があるときに、『中級1』をさらに追加できないようにして」。「両方ふさぐ」= サーバーでの拒否と、既存データの修復。用語と重なりの定義は `src/core/packEditing.ts` の `levelPath`/`pathsOverlap`（等しいか、一方が他方の先頭）。

## Global Constraints

- 重なりの定義は今の `pathsOverlap` と同じ：パス = `levels`（空でなければ）か `[name]`。要素は文字列のまま比べる（大文字と小文字を区別し、trim しない）。等しいか、短い方が長い方の先頭なら重なり。
- 接尾辞は名前の重なりと同じ「（2）」「（3）」…（`numbered`/`fit`）。難易度は `MAX_LEVEL` = 50、名前は `MAX_LIST_NAME` = 200（UTF-16 単位）に収まるよう、元の文字列を切ってから付ける（切ったあと末尾の空白を除く。今の `fit` と同じ）。
- TS と Go の結果はバイト単位で同じ（共通 fixture）。
- バージョン v0.96.2。6 ロケールの文言は増やさない（`levelsConflict` は既存のキー）。
- DB テストは `TYPLE_TEST_DATABASE_URL=postgresql://typle:typle@127.0.0.1:62845/typle?sslmode=disable`。`TestPutListLimit` は main でも落ちる既知の失敗。
- コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## separateLevels のアルゴリズム（TS と Go で同じに）

ライブラリのリストを保存順にたどり、パックごとに「受け入れたパス」の一覧 `accepted` と、そのパックのリスト名（`nameKey` で比べる。名前の補正のあとの値）を持つ。

1. `path` = そのリストのパス（コピー）。`n` = 2。各位置 `i` の元の値 `base[i]` = 補正前の `path[i]`。
2. `accepted` の中に `path` と重なる `q` がある間、または（`levels` がないリストで）名前 `path[0]` を、そのパックの別のリストがすでに使っている間（キーで比べる。自分の元の名前は除く）、次をくり返す：
   - 重なる `q` があれば `i = min(len(path), len(q)) - 1`。名前だけがぶつかる場合は `i = 0`。
   - `path[i] = fit(base[i], "（n）")`。上限は、難易度なら 50、名前なら 200。続けて `n++`。
3. `levels` があれば `levels = path`、なければ `name = path[0]` にして、名前の集合を更新する。`path` を `accepted` に足す。

先に来たリストはそのまま残る。直すのは後のリストだけ。重ならないデータは何も変わらない。

## Review Focus

- 重なりのないデータが 1 バイトも変わらない（既存の fixture がすべてそのまま通る）。
- 「中級1」と「中級1・A」のように一方が先頭の場合も分かれ、練習画面でどちらも選べる。
- 難易度のないリスト「初級」と、難易度「初級」のリストが同じパックにある場合。
- 50 文字の難易度に接尾辞を付けても 50 文字以内になる。
- 補正したデータを、そのまま `PUT /api/workspace` で保存しても拒否されない。

---

### Task 1: TS — 読み込み時に重なりを分ける

**Files:** `src/core/wordPacks.ts`、`tests/wordPacks.test.cjs`、新しい fixture `tests/fixtures/packs/levels-equal.json`・`levels-prefix.json`・`levels-name.json`・`levels-long.json`、README（fixture の約束に 1 行）

**Interfaces:** Produces `separateLevels(library: Library): Library`（export）。`convertLibrary` と `repairLibrary` の最後にかける。

- [ ] fixture を書く（入力 → expected）。等しい（初級 ×3 → 初級、初級（2）、初級（3））、先頭（中級1 / 中級1・A → 2 つ目が 中級1（2）・A）、名前（難易度なしの「初級」と levels [初級]）、長い難易度（50 文字）。`packs: null` の変換経由の場合も 1 つ。
- [ ] `npm test` で失敗を確かめる → 実装する → 通ることを確かめる。重なりを分けたパックで、練習画面の選び方（`levelSteps`/`listAtLevels`）がすべてのリストに届くことを単体テストで確かめる。
- [ ] コミット。

### Task 2: Go — 同じ補正と、保存での拒否

**Files:** `server/internal/workspace/packs_library.go`（`separateLevels`、`CheckPacks`）、`packs_library_test.go`（共通 fixture は既存の読み込みで自動的に通るはず）、`server/internal/web` の PUT のテスト。

**Interfaces:** Consumes Task 1 の fixture。Produces: `CheckPacks` が、パック内でパスが重なるリストを `&Error{Key: "levelsConflict"}` にする。web は `400 {"error":"levelsConflict"}`（今の workspace.Error の扱いに合わせる。ステータスを確かめる）。

- [ ] Go のテストを書く：共通 fixture、`CheckPacks` の拒否、`PUT /api/workspace` で packs 付きの重なりが 400 levelsConflict になり、何も保存されないこと。lists だけの保存（重なりあり）は 200 で、GET では分かれていること。
- [ ] 失敗を確かめる → 実装する → `go test ./...` が通ることを確かめる。
- [ ] TS 側に、送る前に同じ確認をする関数（`CheckLibrary` の TS 版）があれば、同じ確認を足す。
- [ ] コミット。

### Task 3: Kotlin — Task 1・2 と同じ

**Files:** typle-kotlin-backend の該当する補正と保存の確認、そのテスト。ブランチ `feat/level-overlaps`。

- [ ] 共通 fixture（Kotlin 側にも写しがあれば同じものを足す）と、PUT の 400 levelsConflict のテスト → 実装 → Docker で `./gradlew test` を全件通す（DB テストも実行する）→ コミット（push しない）。

### Task 4: バージョンと README

- [ ] v0.96.2 にする。README のバージョンの節に、読み込み時の分け方（例つき）とサーバーでの拒否、lists だけの保存では拒否しないことを書く。`npm test` を通してコミット。
