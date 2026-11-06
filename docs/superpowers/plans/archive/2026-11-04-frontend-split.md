# 大きな画面の分割 Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `WordListEditor.tsx`・`edit/page.tsx`・`play/page.tsx` を、見た目と動作を変えずに責務ごとに分ける。

**Architecture:** 純粋なロジックは `src/core`、状態と副作用は `src/lib/use*.ts`、見た目は `src/components/WordLists/`・`src/components/Practice/` に移す。PR は画面ごとに3つで、前の PR が merge され、Release と本番デプロイが終わってから次を始める。

**Tech Stack:** Next.js、React、TypeScript、next-intl、Playwright、`node:test`

**Spec:** `docs/superpowers/specs/2026-11-04-frontend-split-design.md`

## Global Constraints

- `tests/e2e/` と `src/messages/` を変えない。E2E を直したくなったら動作が変わった合図なので、分割の側を見直す。
- 行数: `edit/page.tsx` は150行以下、`play/page.tsx` と `WordListEditor.tsx` は200行以下、新しいファイルは200行以下。分けると読みにくくなるものは親に残し、超えたら PR に理由を書く。
- 翻訳キー、DOM の構造、クラス名、`id`、`data-*` 属性を変えない。処理を移すときはコメントも一緒に移す。
- `src/core` は翻訳に依存しない。新しい依存、`useReducer`、Context を入れない。
- 既存の処理は書き換えず、そのまま移す。見つけたバグは直さず記録する。
- コミットメッセージと PR は日本語で書き、コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を、PR の本文の末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)` を付ける。
- PR のタイトルは日本語の1文で、末尾に `(vX.Y.Z)` を付ける。`fix:` などの接頭辞は付けない。
- ブランチは `git switch --no-track -c <名前> origin/main` で作る（`--no-track` がないと、サンドボックスが `.git/config` への書き込みを止めて途中で失敗する）。
- 単体テストは `node --test --test-isolation=none tests/<名前>.test.cjs` で動かす。テストの先頭は `require('./register.cjs')` とする。
- E2E は `npm run build` のあとに動かし、Postgres（`DATABASE_URL`）が要る。手元で動かせないときはその旨を報告し、PR の `verify` を最終の確認にする。

## Review Focus

E2E を変えない約束なので、次は各 PR の最後のタスクで、手元の画面を操作して確かめる。

1. 日本語 IME の変換中に `Esc` を押すと、変換だけが取り消され、練習はやり直しにならない。確定後も単語の判定が正しい。単語が進んでも入力欄のフォーカスが残る（Task 14）。
2. 未保存のエディターでブラウザーの戻るを押すと確認が出る。「編集を続ける」を選ぶと、URL が `/edit?list=<id>` に戻り、入力が残っている（Task 9）。
3. 一覧の最後の行を削除すると、1つ上の行にフォーカスが移る。削除をキャンセルすると、元の行に戻る。最後の1件のときは見出しに移る（Task 9）。
4. 名前が重複して保存に失敗すると、名前の欄にフォーカスが1回だけ移り、エラーは名前を変えるまで残る（Task 4）。
5. 練習中にリストの切り替えを始めてキャンセルすると、練習が続き、入力欄にフォーカスが戻り、選択肢のレベルの選択も元に戻る（Task 14）。

---

# PR 1：`WordListEditor`

ブランチ: `claude/frontend-split`（作成済み）。仕様書とこの計画もこの PR に含める。

### Task 1: 単語の下書きのロジックを core に移す

**Files:**
- Create: `src/core/wordDraft.ts`
- Create: `tests/wordDraft.test.cjs`
- Modify: `src/components/WordListEditor.tsx:28-37,117-124`

**Interfaces:**
- Produces（すべて `src/core/wordDraft.ts`）:
  - `type Word = SavedWordList['words'][number]`
  - `type DraftWord = Word & { key: string }`
  - `const MAX_WORDS = 1000`
  - `const WRITING_DEFAULTS: Record<string, WritingLanguage>`
  - `emptyWord(): Word`
  - `normalizeWord(word: Word): Word`
  - `isFilledWord(word: Word): boolean`
  - `draftSnapshot(name: string, packId: string | null, levels: string[], writing: WritingLanguage | null, words: Word[]): string`
  - `savedWords(words: DraftWord[]): Word[]`
  - `type DraftProblem = { field: 'name' } | { field: 'display' | 'input'; key: string }`
  - `draftProblems(name: string, words: DraftWord[]): DraftProblem[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/wordDraft.test.cjs` に次のテストを書く。

```js
test('normalizeWord empties an input equal to the display and defaults the type', () => {
  assert.deepEqual(normalizeWord({ display: 'ls', input: 'ls', annotation: '' }), { display: 'ls', input: '', annotation: '', input_type: 'word' })
})
test('savedWords drops the key and uses the display for an empty input', () => {
  assert.deepEqual(savedWords([{ key: 'a', display: 'ls', input: '', annotation: '', input_type: 'word' }]), [{ display: 'ls', input: 'ls', annotation: '', input_type: 'word' }])
})
test('draftSnapshot changes with a word and ignores keys', () => {
  const word = { display: 'ls', input: '', annotation: '', input_type: 'word' }
  assert.equal(draftSnapshot('a', null, [], null, [{ ...word, key: 'x' }]), draftSnapshot('a', null, [], null, [{ ...word, key: 'y' }]))
  assert.notEqual(draftSnapshot('a', null, [], null, [word]), draftSnapshot('a', null, [], null, [{ ...word, display: 'cd' }]))
})
test('draftProblems lists the name first, then one problem per word', () => {
  const word = (key, display, input = '') => ({ key, display, input, annotation: '', input_type: 'word' })
  assert.deepEqual(draftProblems(' ', [word('a', ' '), word('b', 'ls', '  '), word('c', 'ls')]),
    [{ field: 'name' }, { field: 'display', key: 'a' }, { field: 'input', key: 'b' }])
})
test('isFilledWord is false only when every field is empty', () => {
  assert.equal(isFilledWord({ display: '', input: '', annotation: '' }), false)
  assert.equal(isFilledWord({ display: '', input: '', annotation: 'x' }), true)
})
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test --test-isolation=none tests/wordDraft.test.cjs`
Expected: FAIL（`src/core/wordDraft.ts` が見つからない）

- [ ] **Step 3: `src/core/wordDraft.ts` を作る**

`WordListEditor.tsx:28-37` の処理を移す。`emptyWord` などの中身は変えない。`draftProblems` は `WordListEditor.tsx:118-122` の判定を、翻訳を除いてそのまま移す。

- [ ] **Step 4: `WordListEditor.tsx` を core の関数に置き換える**

`problems` の組み立ては画面に残す。`draftProblems` の結果を `{ id, message }` に直し、`name` は `errors("listNameRequired")`、`display` は `t("displayRequired")`、`input` は `t("inputBlank")` とする。

- [ ] **Step 5: 確認する**

Run: `node --test --test-isolation=none tests/wordDraft.test.cjs && npm run typecheck && npm run lint`
Expected: すべて成功

- [ ] **Step 6: コミットする**

```bash
git add src/core/wordDraft.ts tests/wordDraft.test.cjs src/components/WordListEditor.tsx
git commit -m "単語の下書きのロジックを core に移す"
```

### Task 2: 単語の配列の操作をフックに移す

**Files:**
- Create: `src/lib/useWordDraft.ts`
- Modify: `src/components/WordListEditor.tsx:93,149-176,290-296,310-317`

**Interfaces:**
- Consumes: Task 1 の `DraftWord`・`emptyWord`・`normalizeWord`・`isFilledWord`
- Produces: `useWordDraft(initial: SavedWordList | undefined, focusWord: (key: string) => void)` が次を返す
  - `words: DraftWord[]`、`filled: DraftWord[]`
  - `add(): void`、`moveTo(index: number, target: number): void`、`remove(index: number): void`
  - `update(key: string, change: Partial<Word>): void`
  - `reorder(activeKey: string, overKey: string): void`
  - `load(imported: Word[], mode: 'replace' | 'append'): number`：取り込み後に既存の残った語の数を返す。上限を超えたら `AppError('importTooManyRows')` を投げる

`mode` の型は `WordListImport` の `onImport` に合わせる。

- [ ] **Step 1: `src/lib/useWordDraft.ts` を作り、`WordListEditor.tsx` から使う**

`add` の `flushSync` のあとの `focusWord`、`remove` の `requestAnimationFrame` のあとの `focusWord` は、順序を変えない。`if (!problems.length) setSubmitted(false)` は `add()` の前に画面の側で呼ぶ。名前の補完と `setNotice` は画面に残す。

- [ ] **Step 2: 確認する**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべて成功

- [ ] **Step 3: コミットする**

```bash
git add src/lib/useWordDraft.ts src/components/WordListEditor.tsx
git commit -m "単語の配列の操作を useWordDraft に移す"
```

### Task 3: エディターの見た目を部品に分ける

**Files:**
- Create: `src/components/WordLists/WordRowFields.tsx`
- Create: `src/components/WordLists/WordListBasics.tsx`
- Create: `src/components/WordLists/WordListSaveBar.tsx`
- Modify: `src/components/WordListEditor.tsx:247-283,320-389,405-429`

**Interfaces:**
- Consumes: Task 2 の `useWordDraft` の戻り値
- Produces:
  - `WordRowFields`（`:325-388`）の props: `word`、`index`、`count`、`baseId`、`displayId`、`inputId`、`saving`、`displayError`、`inputError`、`onChange(change)`、`onMove(target)`、`onRemove()`。`SortableWordRow` を含めて返す
  - `WordListBasics`（`:247-283`）の props は、この範囲が読む値と setter をそのまま渡す
  - `WordListSaveBar`（`:405-429`）の props: `recount`、`errorCount`、`onFirstError`、`serverError`、`dirty`、`wordCount`、`saving`、`onCancel`

`menuItem` の定数は `WordRowFields.tsx` に移す。

- [ ] **Step 1: 3つの部品を作り、JSX をそのまま移す**

クラス名、`id`、`aria-*`、`data-word-key` は1文字も変えない。

- [ ] **Step 2: 行数と差分を確かめる**

Run: `wc -l src/components/WordListEditor.tsx src/components/WordLists/WordRowFields.tsx src/components/WordLists/WordListBasics.tsx src/components/WordLists/WordListSaveBar.tsx && npm run typecheck && npm run lint`
Expected: どのファイルも200行以下。型検査と lint が成功

- [ ] **Step 3: コミットする**

```bash
git add src/components/WordLists src/components/WordListEditor.tsx
git commit -m "単語リストのエディターの見た目を部品に分ける"
```

### Task 4: PR 1 を確認して作る

**Files:**
- Modify: `package.json`、`package-lock.json`

- [ ] **Step 1: バージョンを決めて上げる**

`git tag` と `gh release list` で未使用の番号を確かめる。v2.24.0 のままなら `npm version 2.24.1 --no-git-tag-version`。

- [ ] **Step 2: 全体を確認する**

Run: `npm run typecheck && npm test && npm run lint && npm run build && npm run test:e2e`
Expected: すべて成功。Postgres がなく E2E を動かせないときは報告する

- [ ] **Step 3: 変えてはいけない場所を確かめる**

Run: `git diff origin/main --stat -- tests/e2e src/messages`
Expected: 出力なし

- [ ] **Step 4: 手元の画面で Review Focus の 4 を確かめる**

ゲストの状態で `/create` から同じ名前のリストを保存する。

- [ ] **Step 5: コミットする**

```bash
git add package.json package-lock.json docs/superpowers
git commit -m "単語リストのエディターを責務ごとに分ける (v2.24.1)"
```

- [ ] **Step 6: ユーザーの確認を取り、push して PR を作る**

タイトルは `単語リストのエディターを責務ごとに分ける (v2.24.1)`。merge は `verify` の合格後に、ユーザーの確認を取ってから行う。

---

# PR 2：`edit/page.tsx`

PR 1 の Release と本番デプロイのあとに始める。ブランチ: `claude/frontend-split-edit`

### Task 5: 一覧のロジックを core に移す

**Files:**
- Modify: `src/core/packEditing.ts`
- Modify: `tests/packEditing.test.cjs`
- Modify: `src/app/(workspace)/edit/page.tsx:173,221-229,315,368-369,422-424`

**Interfaces:**
- Produces（すべて `src/core/packEditing.ts`）:
  - `sortPacks(items: PackOverview[], order: ListOrder, locale: string): PackOverview[]`
  - `visibleListRows(item: PackOverview, query: string): PackOverview['lists']`
  - `loneListPack(library: Library, packId: string | undefined): WordPack | undefined`
  - `storedLibrary(library: Library): Library`：リストから `group`・`category`・`tags` を除く

- [ ] **Step 0: ブランチを作る**

Run: `git fetch origin && git switch --no-track -c claude/frontend-split-edit origin/main`
Expected: `git status -sb` の変更がなく、`src/components/WordLists/WordRowFields.tsx` がある

- [ ] **Step 1: 失敗するテストを `tests/packEditing.test.cjs` に足す**

```js
const overview = (name, position, lastPracticed = null) => ({ pack: { name }, position, wordCount: 1, lastPracticed })
const twoLists = () => ({
  packs: [{ id: 'p', name: 'Linux', category: 'プログラミング', tags: [], createdAt: stamp }],
  lists: [list('a', 'Files', 'p', { words: words('ls') }), list('b', 'Moves', 'p', { words: words('cd') })],
})
test('sortPacks sorts by name, then newest position', () => {
  const sorted = sortPacks([overview('b', 1), overview('a', 2), overview('a', 3)], 'name', 'en')
  assert.deepEqual(sorted.map(item => [item.pack.name, item.position]), [['a', 3], ['a', 2], ['b', 1]])
})
test('sortPacks puts unpractised packs last for practiced', () => {
  const sorted = sortPacks([overview('new', 2), overview('old', 1, 100)], 'practiced', 'en')
  assert.deepEqual(sorted.map(item => item.pack.name), ['old', 'new'])
})
test('visibleListRows shows only the lists found by their words', () => {
  const [item] = packOverviews(twoLists())
  assert.deepEqual(visibleListRows(item, 'cd').map(row => row.list.id), ['b'])
})
test('visibleListRows shows every list when the pack name matches', () => {
  const [item] = packOverviews(twoLists())
  assert.deepEqual(visibleListRows(item, 'linux').map(row => row.list.id), ['a', 'b'])
})
test('loneListPack returns the pack only when it has one list', () => {
  const library = twoLists()
  assert.equal(loneListPack(library, 'p'), undefined)
  assert.equal(loneListPack({ ...library, lists: library.lists.slice(0, 1) }, 'p')?.id, 'p')
})
test('storedLibrary removes the labels the screens add to lists', () => {
  const library = twoLists()
  const labelled = { ...library, lists: library.lists.map(item => ({ ...item, group: 'g', category: 'c', tags: ['t'] })) }
  assert.deepEqual(storedLibrary(labelled), library)
})
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test --test-isolation=none tests/packEditing.test.cjs`
Expected: FAIL（`sortPacks` などが関数でない）

- [ ] **Step 3: 関数を実装し、`page.tsx` から使う**

`sortPacks` は `page.tsx:221-229` を、`visibleListRows` は `:422-424` をそのまま移す。`ListOrder` は型だけ import する。

- [ ] **Step 4: 確認する**

Run: `node --test --test-isolation=none tests/packEditing.test.cjs && npm run typecheck && npm run lint`
Expected: すべて成功

- [ ] **Step 5: コミットする**

```bash
git add src/core/packEditing.ts tests/packEditing.test.cjs "src/app/(workspace)/edit/page.tsx"
git commit -m "単語リストの一覧のロジックを core に移す"
```

### Task 6: URL の同期とハイライトと操作をフックに移す

**Files:**
- Create: `src/lib/useEditorRoute.ts`
- Create: `src/lib/useRowHighlight.ts`
- Create: `src/lib/useListActions.ts`
- Modify: `src/app/(workspace)/edit/page.tsx:87-91,106-170,275-336`

**Interfaces:**
- Produces:
  - `useEditorRoute(urlId: string | null)` が `{ openId, cancelRequest, open(list: SavedWordList): void, close(): void, trackDirty(value: boolean): void }` を返す
  - `useRowHighlight(attribute: 'data-list-id' | 'data-pack-id', paused = false)` が `[id: string | null, setId: (id: string | null) => void]` を返す。行へのスクロールと2400msでの解除を受け持つ
  - `useListActions({ packs, lists, update, updateLibrary, notify, onPackCreated, onListCopied })` が `{ error, exportCsv, exportPack, copyPackOf, copyList, importFile }` を返す。`onPackCreated(id)` は検索と絞り込みを消してパックを開き、`onListCopied(id)` は検索だけ消して行を示す

- [ ] **Step 1: 3つのフックを作り、処理をそのまま移す**

描画中に状態を直す `seenUrl` の処理は `useEditorRoute` の中に、`seenPack` の処理は `page.tsx` に残す。`useEditorRoute` を `useRowHighlight` より先に呼び、`useEffect` の順序を保つ。元の `close(saved)` の `setHighlight(saved)` は、呼び出す側で `close()` の直後に行う。

- [ ] **Step 2: 確認する**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべて成功

- [ ] **Step 3: コミットする**

```bash
git add src/lib "src/app/(workspace)/edit/page.tsx"
git commit -m "単語リストの画面の URL 同期とハイライトと操作をフックに移す"
```

### Task 7: 一覧の小さな部品を分ける

**Files:**
- Create: `src/components/WordLists/OrderMenu.tsx`
- Create: `src/components/WordLists/EmptyLists.tsx`
- Create: `src/components/WordLists/ListsLoading.tsx`
- Create: `src/components/WordLists/PackFileInput.tsx`
- Create: `src/components/WordLists/ListToolbar.tsx`
- Modify: `src/app/(workspace)/edit/page.tsx:63-76,374-376,387-389,398-413,515-550`

**Interfaces:**
- Produces:
  - `OrderMenu`・`EmptyLists`・`ListsLoading`：今の props のまま default export で移す
  - `PackFileInput`：props は `disabled`、`className?`、`onFile(file: File)`。隠しファイル入力とボタンを返す
  - `ListToolbar`：props は `query`、`onQueryChange`、`labels`、`filter`、`onFilterChange`、`order`、`onOrderChange`、`shownCount`、`totalCount`、`narrowed`

- [ ] **Step 1: 部品を作り、JSX をそのまま移す**

`PackFileInput` の隠し入力は、ボタンの直前に置く。今の2か所とも同じ並びである。

- [ ] **Step 2: 確認する**

Run: `npm run typecheck && npm run lint`
Expected: 成功

- [ ] **Step 3: コミットする**

```bash
git add src/components/WordLists "src/app/(workspace)/edit/page.tsx"
git commit -m "単語リストの一覧の小さな部品を分ける"
```

### Task 8: `ListManager` と削除のダイアログを分ける

**Files:**
- Create: `src/components/WordLists/ListManager.tsx`
- Create: `src/components/WordLists/DeleteListDialog.tsx`
- Create: `src/components/WordLists/DeletePackDialog.tsx`
- Create: `src/lib/focusAfterRemoval.ts`
- Modify: `src/app/(workspace)/edit/page.tsx`

**Interfaces:**
- Consumes: Task 5〜7 の関数と部品
- Produces:
  - `focusAfterRemoval(event: Event, selector: string, position: number, removed: boolean): void`：`focusAfterDelete` と `focusAfterDeletePack` を1つにする。`selector` は `'[data-list-id] [data-edit]'` と `'[data-pack-id] h3 button'`。見つからなければ `list-heading` にフォーカスする
  - `DeleteListDialog`：props は `state`（`{ open, item, position }`）、`lonePackName`、`now`、`onOpenChange`、`onExport`、`onDelete(list): Promise<boolean>`。`DeleteDetails` と `deleted` の ref を持つ
  - `DeletePackDialog`：props は `state`、`shared`、`onOpenChange`、`onDelete(pack): Promise<boolean>`。`packDeleted` の ref を持つ
  - `ListManager`：今の props のまま default export で移す

- [ ] **Step 1: 部品を作り、処理をそのまま移す**

今は開くときに親が `deleted.current = false` としている。ref がダイアログの中に移るので、`onDelete` が成功したら `true` にし、`onCloseAutoFocus` で `focusAfterRemoval` を呼んだ直後に `false` へ戻す。`useEffect` は足さない。

- [ ] **Step 2: 行数を確かめる**

Run: `wc -l "src/app/(workspace)/edit/page.tsx" src/components/WordLists/ListManager.tsx && npm run typecheck && npm run lint`
Expected: `page.tsx` は150行以下、`ListManager.tsx` は200行以下。型検査と lint が成功

- [ ] **Step 3: コミットする**

```bash
git add src/components/WordLists src/lib/focusAfterRemoval.ts "src/app/(workspace)/edit/page.tsx"
git commit -m "単語リストの一覧と削除のダイアログを部品に分ける"
```

### Task 9: PR 2 を確認して作る

**Files:**
- Modify: `package.json`、`package-lock.json`

- [ ] **Step 1: Task 4 の Step 1〜3 と同じ確認をする**

使っていない次のパッチ番号に上げる。

- [ ] **Step 2: 手元の画面で Review Focus の 2 と 3 を確かめる**

- [ ] **Step 3: コミットし、ユーザーの確認を取って PR を作る**

タイトルは `単語リストの画面を責務ごとに分ける (vX.Y.Z)`。

---

# PR 3：`play/page.tsx`

PR 2 の Release と本番デプロイのあとに始める。ブランチ: `claude/frontend-split-play`

### Task 10: 練習の画面のロジックを core に移す

**Files:**
- Create: `src/core/practiceView.ts`
- Create: `tests/practiceView.test.cjs`
- Modify: `src/app/(workspace)/play/page.tsx:50-52,118,242-243,366,376-377`

**Interfaces:**
- Produces（すべて `src/core/practiceView.ts`）:
  - `matchingPacks(items: PackOverview[], category: string | null, query: string): PackOverview[]`
  - `upcomingWords(words: Word[], index: number): { next: Word[]; remaining: number }`：`next` は最大3語
  - `oneLineDisplay(word: Word): string`
  - `isParagraphWord(word: Word): boolean`
  - `currentMode(choice: WritingChoice, started: boolean, runMode: PracticeMode | null | undefined, chosen: PracticeMode): PracticeMode`

`WritingChoice` は `src/lib/writingMode.ts` にあるので、core では `'normal' | 'writing'` と書く。

- [ ] **Step 0: ブランチを作る**

Run: `git fetch origin && git switch --no-track -c claude/frontend-split-play origin/main`
Expected: `git status -sb` の変更がなく、`src/components/WordLists/ListManager.tsx` がある

- [ ] **Step 1: 失敗するテストを書く**

```js
const word = (display, input_type = 'word') => ({ display, input: display, annotation: '', input_type })
test('upcomingWords returns up to three words and the rest', () => {
  const words = ['a', 'b', 'c', 'd', 'e', 'f'].map(text => word(text))
  assert.deepEqual(upcomingWords(words, 0).next.map(item => item.display), ['b', 'c', 'd'])
  assert.equal(upcomingWords(words, 0).remaining, 2)
  assert.deepEqual(upcomingWords(words, 5), { next: [], remaining: 0 })
})
test('oneLineDisplay joins code lines with two spaces and leaves other words alone', () => {
  assert.equal(oneLineDisplay(word('a\r\nb\nc', 'code')), 'a  b  c')
  assert.equal(oneLineDisplay(word('a\nb')), 'a\nb')
})
test('isParagraphWord is true over 24 characters or with a line break, never for code', () => {
  assert.equal(isParagraphWord(word('あ'.repeat(24))), false)
  assert.equal(isParagraphWord(word('あ'.repeat(25))), true)
  assert.equal(isParagraphWord(word('😀'.repeat(24))), false)
  assert.equal(isParagraphWord(word('a\nb')), true)
  assert.equal(isParagraphWord(word('a'.repeat(30), 'code')), false)
})
test('currentMode: writing wins, a started run keeps its mode, otherwise the choice applies', () => {
  assert.equal(currentMode('writing', true, 'recall', 'normal'), 'writing')
  assert.equal(currentMode('normal', true, 'recall', 'normal'), 'recall')
  assert.equal(currentMode('normal', true, null, 'recall'), 'recall')
  assert.equal(currentMode('normal', false, 'normal', 'recall'), 'recall')
})
```

`matchingPacks` のテストは、カテゴリーと検索語の両方で絞られることを `tests/packEditing.test.cjs` と同じデータの形で確かめる。

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test --test-isolation=none tests/practiceView.test.cjs`
Expected: FAIL（`src/core/practiceView.ts` が見つからない）

- [ ] **Step 3: `src/core/practiceView.ts` を作り、`page.tsx` から使う**

- [ ] **Step 4: 確認する**

Run: `node --test --test-isolation=none tests/practiceView.test.cjs && npm run typecheck && npm run lint`
Expected: すべて成功

- [ ] **Step 5: コミットする**

```bash
git add src/core/practiceView.ts tests/practiceView.test.cjs "src/app/(workspace)/play/page.tsx"
git commit -m "練習の画面のロジックを core に移す"
```

### Task 11: 切り替えの確認とフォーカスをフックに移す

**Files:**
- Create: `src/lib/usePracticeSwitch.ts`
- Create: `src/lib/usePracticeFocus.ts`
- Modify: `src/app/(workspace)/play/page.tsx:93,102-104,111,155-197,205-232`

**Interfaces:**
- Produces:
  - `usePracticeSwitch({ wordLists, selected, running, currentChoice, onSwitchList(index), onChooseWriting(choice) })` が `{ pending, cancels, requestList(id: string): void, requestWriting(choice: WritingChoice): void, confirm(): void, cancel(): void }` を返す
  - `usePracticeFocus({ mode, finished, input, showResume, writingChoice })` が `{ focusInput(): void, focusPractice(event: Event): void, rememberOpener(): void, closePicker(event: Event): void, focusTypingNext(): void }` を返す

- [ ] **Step 1: 2つのフックを作り、処理をそのまま移す**

`requestSwitch` の `setPickerOpen(false)` と `setQuery('')` は、`requestList` の前に画面の側で呼ぶ。`usePracticeFocus` の中の `useEffect` は、キー入力の処理、手書きから戻ったときのフォーカスの順に呼ぶ。`focusTypingNext()` は `focusTypingOnMount.current = true` にあたる。

- [ ] **Step 2: 確認する**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべて成功

- [ ] **Step 3: コミットする**

```bash
git add src/lib "src/app/(workspace)/play/page.tsx"
git commit -m "練習の切り替えの確認とフォーカスをフックに移す"
```

### Task 12: 入力に関わらない部品を分ける

**Files:**
- Create: `src/components/Practice/UpcomingWords.tsx`
- Create: `src/components/Practice/BestRecordsCard.tsx`
- Create: `src/components/Practice/ListSearchField.tsx`
- Create: `src/components/Practice/ListChooserAside.tsx`
- Create: `src/components/Practice/ListPickerDialog.tsx`
- Create: `src/components/Practice/SwitchConfirmDialog.tsx`
- Modify: `src/app/(workspace)/play/page.tsx:140-153,364-389,393-401,403-423,425-457`

**Interfaces:**
- Consumes: Task 10 の `upcomingWords`・`oneLineDisplay`・`isParagraphWord`、Task 11 の `usePracticeSwitch`
- Produces:
  - `UpcomingWords`：props は `words`、`index`、`showAll`、`onToggleAll`。全単語のスクロールの `useEffect` と `allWords` の ref を持つ
  - `ListChooserAside`：props は `open`、`packs`、`labels`、`category`、`onCategoryChange`、`query`、`onQueryChange`、`selectedId`、`resetKey`、`mode`、`onSelect(id)`。選択中のリストを見える位置に保つ `useEffect` と `asideLists` の ref を持つ
  - `ListSearchField`：props は `value`、`onChange`、`placeholder`、`ariaLabel`、`className`。高さの違う2か所は `className` で渡す
  - `BestRecordsCard`・`ListPickerDialog`・`SwitchConfirmDialog`：移す範囲が読む値を props で渡す

`showAll` の状態は `switchTo` が使うので `page.tsx` に残す。

- [ ] **Step 1: 部品を作り、JSX をそのまま移す**

`id="all-words"`、`id="practice-aside"`、`aria-controls` は変えない。スクロールだけの `useEffect` は、部品に移ると親より先に動くが、フォーカスに関わらないので問題ない。

- [ ] **Step 2: 確認する**

Run: `npm run typecheck && npm run lint`
Expected: 成功

- [ ] **Step 3: コミットする**

```bash
git add src/components/Practice "src/app/(workspace)/play/page.tsx"
git commit -m "練習の画面の入力に関わらない部品を分ける"
```

### Task 13: 入力欄と出題とヘッダーを分ける

**Files:**
- Create: `src/components/Practice/PracticeHeader.tsx`
- Create: `src/components/Practice/WordPrompt.tsx`
- Create: `src/components/Practice/TypingInput.tsx`
- Modify: `src/app/(workspace)/play/page.tsx:244-249,261-288,300-361`

**Interfaces:**
- Produces:
  - `PracticeHeader`（`:261-288`）：今の操作に必要な値と処理を props で渡す
  - `WordPrompt`（`:300-327`）：props は `word`、`recall`、`comparison`、`revealed`、`showResume`、`onReveal`、`onResume`
  - `TypingInput`（`:328-361`）：props は `inputRef`、`session`、`composition`、`comparison`、`simpleKeys`、`onFocus`、`onBlur`、`onRestart`、`onCompositionStart`、`onCompositionEnd`、`onChange`。`feedback` の組み立てと `onSelect` の補正を持つ

- [ ] **Step 1: 部品を作り、JSX をそのまま移す**

`key={`${list.id}:${session.index}:${displayRun}`}` は `<WordPrompt>` に付け、`<TypingInput>` には付けない。`TypingInput` は `WordPrompt` の兄弟に置き、親の DOM を変えない。`onSelect`・`onKeyDown`・`onCompositionEnd`・`onChange` の中身とコメントは変えない。

- [ ] **Step 2: 行数を確かめる**

Run: `wc -l "src/app/(workspace)/play/page.tsx" src/components/Practice/PracticeHeader.tsx src/components/Practice/WordPrompt.tsx src/components/Practice/TypingInput.tsx && npm run typecheck && npm run lint`
Expected: どのファイルも200行以下。型検査と lint が成功

- [ ] **Step 3: 入力の E2E を動かす（手元で動かせるとき）**

Run: `npm run build && npx playwright test tests/e2e/practice.spec.ts tests/e2e/practice-caret.spec.ts tests/e2e/practice-refocus.spec.ts tests/e2e/practice-multiline.spec.ts tests/e2e/play.spec.ts tests/e2e/recall.spec.ts tests/e2e/writing.spec.ts`
Expected: すべて成功

- [ ] **Step 4: コミットする**

```bash
git add src/components/Practice "src/app/(workspace)/play/page.tsx"
git commit -m "練習の入力欄と出題とヘッダーを部品に分ける"
```

### Task 14: PR 3 を確認して作る

**Files:**
- Modify: `package.json`、`package-lock.json`
- Modify: `README.md`（「コードの構成」の説明と合わなくなった場合のみ）

- [ ] **Step 1: Task 4 の Step 1〜3 と同じ確認をする**

使っていない次のパッチ番号に上げる。

- [ ] **Step 2: 手元の画面で Review Focus の 1 と 5 を確かめる**

IME の操作は実機の日本語入力が要るので、ユーザーに確かめてもらう。手順は PR に書く。

- [ ] **Step 3: コミットし、ユーザーの確認を取って PR を作る**

タイトルは `練習の画面を責務ごとに分ける (vX.Y.Z)`。
