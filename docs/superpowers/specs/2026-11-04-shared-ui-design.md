# 画面をまたぐ部品の共通化 設計

日付: 2026-11-04 ／ 対象: typle-r v2.24.7（`a832aad`）

## 目的

画面ごとに書かれているメニュー、空の状態、検索欄を `src/components/ui/` の部品にまとめ、同じクラスの文字列を画面に書かなくて済むようにする。画面の見た目と動作は変えない。

成功の条件:

- `tests/e2e/` と `src/messages/` を1行も変えずに、E2E がすべて通る。
- `src/app` と `src/components`（`ui/` を除く）から、`radix-ui` の `DropdownMenu` の直接の import がなくなる。
- 対象の要素に当たるクラスの集合が、変更の前後で同じである。順序の違いと、部品が足す `data-slot` だけを許す。
- 新しい部品は既存の `ui/` と同じ書き方で、それぞれ200行以下である。

## 範囲外

- 見た目の統一。余白、高さ、色の違いは残す。
- `gallery` の検索欄。`Input` を使う別の形で、部品にする効果がない。
- `Sidebar/NavList` の項目。メニューではなくナビゲーションである。
- エラー表示の `role="alert"`、ネイティブの `<select>` の共通化。
- 動作の改善やバグの修正。見つけたものは別の作業として記録する。

## 1. 分け方の決まり

- 部品は `src/components/ui/` に置き、既存の `popover.tsx` と同じ書き方にする。関数ごとに `React.ComponentProps` を受け取り、`data-slot` を付け、`className` は `cn` でまとめる。
- 部品の既定は、いちばん多い形にする。違う箇所は `variant`、`size`、`className` で表す。
- 画面の違いは呼び出す側に残す。部品の中で画面の都合を判断しない。
- 翻訳は部品に持ち込まない。文言は props で受け取る。
- PR は部品の種類ごとに3つに分け、順に merge する。

## 2. PR 1：`ui/dropdown-menu.tsx`

11ファイルの `DropdownMenu.*` を置き換える。対象は `AccountBar`、`SortableListRow`、`Devices/CurrentDevice`、`Practice/DeviceMenu`、`Rankings/RankingList`、`Records/FilterMenu`、`WordLists/` の `LabelFilter`、`ListRow`、`OrderMenu`、`PackRow`、`WordRowFields`。

作る部品:

| 部品 | 中身 |
|---|---|
| `DropdownMenu`、`DropdownMenuTrigger`、`DropdownMenuRadioGroup` | Radix をそのまま包む |
| `DropdownMenuContent` | `Portal` を含む。既定のクラスは `z-50 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md`。幅などは `className` で渡す。`align` と `sideOffset` は既定値を持たず、呼び出す側が今の値を渡す |
| `DropdownMenuItem` | 操作の項目。既定のクラスは `ListRow` などの `menuItem`。`variant="destructive"` で削除の色を足す。`variant="bare"` は既定のクラスを使わず、`className` だけを当てる |
| `DropdownMenuRadioItem` | 選択の項目。`pl-8` の型で、チェックの印を中に持つ |
| `DropdownMenuCheckboxItem` | `LabelFilter` の複数選択。チェックの印を中に持つ |
| `DropdownMenuLabel`、`DropdownMenuSeparator` | 今の見出しと区切り線 |

型が違う箇所:

- `AccountBar` の項目は `px-3` で、アイコンの色も違い、`select-none` などを持たない。既定のクラスに `className` を重ねるとクラスの集合が変わるので、`variant="bare"` と今の `itemClass` を渡す。枠の `border-border` は `className` で渡す。
- `DeviceMenu` と `LabelFilter` の `Item` は、ラジオの項目と同じ `pl-8` の型なので、`variant="inset"` を使う。
- `ListRow` と `PackRow` の項目は既定の型に `[&_svg]:shrink-0 [&_svg]:text-muted-foreground` が足されたものなので、この2つを `className` で渡す。
- `DropdownMenuLabel` は3種類のクラスがあるので、既定のクラスを持たず、今のクラスを `className` で渡す。`DropdownMenuSeparator` の既定は `my-1 h-px bg-border` とする。
- チェックの印は7か所すべて `absolute left-2.5 inline-flex` と `Check` の `size-4` で同じなので、部品の中に固定する。

## 3. PR 2：`ui/empty-state.tsx`

| 部品 | 中身 |
|---|---|
| `EmptyNote` | 小さな文の型。`<p>` に `rounded-xl border border-dashed bg-card px-5 py-6 text-sm text-muted-foreground` を付ける。`role` などは props で渡す |
| `EmptyState` | 大きな型。`flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 text-center` を持つ `<div>`。縦の余白と `gap` の違いは `className` で渡す。中身は `children` で受け取る |

対象は11か所。`packs/catalog`、`GalleryList`、`InterestPacks` が `EmptyNote` で、`devices`、`rankings`、`records`（2か所）、`words`、`EmptyLists`、`ListManager` が `EmptyState` である。アイコンと見出しの形は画面ごとに違うので、部品にしない。`id`（`empty-heading`）も呼び出す側に残す。

## 4. PR 3：`ui/search-field.tsx`

| 部品 | 中身 |
|---|---|
| `SearchField` | アイコンを `<label>` に並べる型。`Practice/ListSearchField` を移し、`words` と `PackEditor` でも使う。`<label>` のクラスは今の違いを `className` で渡す |
| `ClearableSearchField` | 消すボタン付きの型。`ListToolbar` と `RankingList` が使う。`size="sm"`（`RankingList`：`h-9`、`pl-8`、`size-6`）と既定（`ListToolbar`：`h-10`、`pl-9`、`size-7`）で大きさを切り替える。背景の `bg-transparent` と `bg-background` の違いは `className` で渡す。消すボタンのラベルは `clearLabel` で受け取る |

`Practice/ListSearchField.tsx` は削除し、使っている `ListChooserAside` と `ListPickerDialog` を `SearchField` に替える。

## 5. 変えないもの

- 要素に当たるクラスの集合。順序だけは変わってよい。
- 翻訳キー、DOM の入れ子、`id`、既存の `data-*`、`aria-*`。Radix の `role` が変わらないので、E2E のセレクターは同じまま動く。
- `onCloseAutoFocus`、`onOpenChange` など、フォーカスに関わる props。`DeviceMenu` の `onCloseAutoFocus` は練習の入力欄へ戻るために要る。
- `data-slot` は増える。既存の `ui/` の決まりに合わせるためで、表示には影響しない。

## 6. 進め方と確認

PR ごとに確認すること:

- `npm run typecheck`、`npm test`、`npx eslint src tests --max-warnings 0`、PR の `verify`（ビルドと E2E を含む）が通る。
- `git diff origin/main --stat -- tests/e2e src/messages` が空である。
- クラスの比較: 置き換えた要素ごとに、前後のクラスの集合が同じことを確かめる。`cn` は同じ種類のクラスの後の方を残すので、既定と `className` が衝突してクラスが消えないことも確かめる。
- 手元の画面で、ライトとダークの両方で、対象のメニューや空の状態を開いて確かめる。

リリースは `docs/release-workflow.md` の順序に従い、動作を変えないのでパッチを上げる。番号は PR の前に `git tag`、GitHub Releases、開いている PR で確かめる。

## 7. 危険と対応

| 危険 | 対応 |
|---|---|
| `cn` が、既定のクラスと渡したクラスの片方を消す。既定のクラスが増えることもある | 第6節のクラスの比較で見つける。既定の型に合う要素には `w-*` のように既定にないものだけを渡し、合わない要素は `variant="bare"` にする |
| 11ファイルを同時に変えるので、別の PR と衝突しやすい | PR を種類ごとに分け、始める前に main に追いつく |
| 単体テストが画面を読まないので、部品の誤りは E2E まで見つからない | E2E を PR ごとに全件動かす |
| 部品の既定に無理に合わせて、呼び出す側が読みにくくなる | 合わない箇所は `variant="bare"` と今のクラスを使い、部品を増やさない |
