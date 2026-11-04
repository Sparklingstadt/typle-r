# 大きな画面の分割 設計

日付: 2026-11-04 ／ 対象: typle-r v2.24.0（`cec6ad3`）

## 目的

状態と処理が集中している3つのファイルを、責務ごとに分けて読みやすく、変更しやすくする。画面の見た目と動作は変えない。

| ファイル | 行数 | `useState` | `useEffect` |
|---|---|---|---|
| `src/app/(workspace)/edit/page.tsx` | 550 | 18 | 6 |
| `src/app/(workspace)/play/page.tsx` | 459 | 14 | 5 |
| `src/components/WordListEditor.tsx` | 443 | 14 | 4 |

成功の条件:

- `tests/e2e/` と `src/messages/` を1行も変えずに、E2E がすべて通る。
- 分けたあとの行数が、`edit/page.tsx` は150行以下、`play/page.tsx` は200行以下、`WordListEditor.tsx` は200行以下になる。新しいファイルもそれぞれ200行以下にする。
- `src/core` に移した処理に単体テストがある。

## 範囲外

- ほかの画面（`PackEditor`、`records`、`words`、`rankings` など）の分割。
- 画面をまたいだ共通部品づくり。この3ファイルの中の重複だけを扱う。
- 状態管理ライブラリ、`useReducer`、Context の導入。依存の追加。
- 見た目の統一。たとえば `WordListEditor` の `Kbd` と `Practice/Kbd` は見た目が違うので、まとめない。
- 動作の改善やバグの修正。分割の途中で見つけたものは別の作業として記録する。

## 1. 分け方の決まり

処理の種類で、置き場所を決める。依存の向きは README の「コードの構成」のままで、`eslint.config.mjs` は変えない。

| 種類 | 置き場所 | 基準 |
|---|---|---|
| 純粋なロジック | `src/core` | React・ブラウザーAPI・翻訳に依存しない。単体テストを足す |
| 状態と副作用 | `src/lib/use*.ts` | URL・履歴・フォーカス・`document` を扱う処理と、それに結びついた状態 |
| 見た目 | `src/components/WordLists/`・`src/components/Practice/` | 受け取るのは props だけ。新しい状態は持ち込まない |

値は props で渡す。翻訳は `src/core` に持ち込まず、core はキーや種類を返して、画面が文に直す。

## 2. PR 1：`WordListEditor`

`create`・`packs/create`・`packs/edit`・`edit` と `WordListEditorPage` が使っているので、props は変えない。

- **core（新規 `src/core/wordDraft.ts`）:** `emptyWord`、`normalize`、`snapshot`、`isFilled`、`WRITING_DEFAULTS`、`MAX_WORDS`、保存する単語への変換、入力チェック。入力チェックは翻訳文ではなく、どの欄のどの問題かを返す。
- **フック（新規 `src/lib/useWordDraft.ts`）:** 単語の配列と、追加・移動・削除・更新・取り込み。`addWord` の `flushSync` と、`remove` の `requestAnimationFrame` によるフォーカスの順序はそのまま保つ。
- **部品:**
  - `WordLists/WordRowFields.tsx`：単語1行の入力欄と操作メニュー
  - `WordLists/WordListBasics.tsx`：パック、名前、レベル、手書きの設定
  - `WordLists/WordListSaveBar.tsx`：下に固定された保存バー

`WordListEditor.tsx` には、フォームの送信、保存失敗の扱い、未保存の確認が残る。

## 3. PR 2：`edit/page.tsx`

- **core（`src/core/packEditing.ts` に追加）:**
  - `sortPacks`（ページから移す）
  - 検索語に応じて表示するリストを選ぶ処理（今は `PackRow` を描く `map` の中にある）
  - リストがパックの最後の1つのときにそのパックを返す処理（`lonePack` と `deletingPackName` の2か所にある）
  - 画面用のリストから保存時の形に戻す処理
- **フック:**
  - `src/lib/useEditorRoute.ts`：`/edit?list=` と履歴の同期、未保存時の確認、一覧へ戻るときのスクロールとフォーカス
  - `src/lib/useRowHighlight.ts`：ほぼ同じ2つのハイライトの `useEffect` を1つにする。パックの側は編集中に止まるので、止める条件を引数で受ける
  - `src/lib/useListActions.ts`：コピー、書き出し、ファイルの取り込み
- **部品:**
  - `WordLists/ListManager.tsx`：一覧の本体
  - `WordLists/ListToolbar.tsx`：検索、絞り込み、並べ替え、件数
  - `WordLists/OrderMenu.tsx`、`WordLists/EmptyLists.tsx`、`WordLists/ListsLoading.tsx`：ページから移す
  - `WordLists/PackFileInput.tsx`：2か所にあるファイル入力と取り込みボタン
  - `WordLists/DeleteListDialog.tsx`、`WordLists/DeletePackDialog.tsx`：削除の確認と、削除後のフォーカス

`page.tsx` には、読み込みの待ち、一覧とエディターの切り替えが残る。

## 4. PR 3：`play/page.tsx`

入力まわりの危険がいちばん大きいので最後に行う。

- **core:** `matchingPacks`、次に出す単語と残りの数、コードを1行で見せる処理（同じ `replace` が2か所にある）、段落として見せる判定、今のモードの決定。
- **フック:**
  - `src/lib/usePracticeSwitch.ts`：練習中のリストとモードの切り替えの確認（`pendingSwitch`、`switchCancels`）
  - `src/lib/usePracticeFocus.ts`：入力欄へのフォーカス、ダイアログを閉じたあとの戻り先、キー入力で練習に戻る処理
- **部品:**
  - `Practice/PracticeHeader.tsx`：カードの上の操作
  - `Practice/WordPrompt.tsx`：出題の表示
  - `Practice/TypingInput.tsx`：見えない入力欄とフィードバック
  - `Practice/UpcomingWords.tsx`：次の単語と全単語
  - `Practice/BestRecordsCard.tsx`：ベスト記録
  - `Practice/ListSearchField.tsx`：リストの検索欄
  - `Practice/ListChooserAside.tsx`：サイドパネル
  - `Practice/ListPickerDialog.tsx`：リストの選択
  - `Practice/SwitchConfirmDialog.tsx`：切り替えの確認

`page.tsx` には、`usePractice` の呼び出しと全体の組み立てが残る。

**特に壊さないこと:**

- 入力欄は再マウントしない。単語ごとに変わる `key={list.id:session.index:displayRun}` は出題の表示だけに付け、`TypingInput` はその外に置く。入れると単語が変わるたびにフォーカスと IME の変換が失われる。
- `WritingPractice` の `key` はそのままにする。
- `onSelect` のカーソルの補正、`onCompositionStart`・`onCompositionEnd`、`onChange` の `isComposing`、`Escape` の判定は、中身を変えずに移す。

## 5. 変えないもの

- 翻訳キー、DOM の構造、クラス名。
- `id` と `data-*` 属性。E2E、フォーカスとキー操作の処理、`aria-*` の参照が使っている（`wordDisplay`、`wordTarget`、`wordInputField`、`writingInputField`、`practice-feedback`、`all-words`、`practice-aside`、`list-heading`、`empty-heading`、`data-list-id`、`data-pack-id`、`data-edit`、`data-word-key`）。
- コードのコメント。処理と一緒に移す。
- `useEffect` の実行順序に意味がある処理は、同じ順序で呼ぶ。描画中に状態を直す処理（`seenUrl`、`seenPack`、`seenCancelRequest`）もそのまま保つ。

## 6. 進め方と確認

1つの PR の中では、core → フック → 部品の順に、動く状態を保ったまま小さく移す。

PR ごとに確認すること:

- `npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`npm run test:e2e` が通る。
- `git diff origin/main --stat -- tests/e2e src/messages` が空である。E2E を直したくなったら動作が変わった合図なので、E2E ではなく分割の側を見直す。
- `play` の PR では、手元の画面で日本語の IME による入力も確かめる。

リリースは `docs/release-workflow.md` の順序に従う。動作を変えないのでパッチを上げ、PR の前に `git tag` と GitHub Releases で番号が空いていることを確かめる。3つの PR は順に、前の PR が merge されてから次を始める。

## 7. 危険と対応

| 危険 | 対応 |
|---|---|
| 分割の途中で main の同じファイルが変わる（この2日間で3ファイルとも変更があった） | PR を画面ごとに小さくし、1つずつ merge する。始める前に main に追いつく |
| 単体テストが画面を読まないので、部品の不具合は E2E まで見つからない | E2E を PR ごとに全件動かす |
| 部品の props が多くなりすぎる | 分けたことで読みにくくなる部品は無理に分けず、親に残す。行数の条件を満たせないときは PR でその理由を書く |
