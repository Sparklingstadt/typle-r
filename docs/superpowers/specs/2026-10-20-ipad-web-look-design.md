# iPadOS版の見た目をWeb版にそろえる 設計

- 日付: 2026-10-20
- 対象バージョン: v0.44.0
- 前提: v0.43.0 の iPadOS 版（`docs/superpowers/specs/2026-10-20-ipad-app-design.md`）

## 目的

iPad アプリの画面を、Web 版と見分けがつかないほど同じ構成・色・部品・文言にする。

## 決定事項

| 項目 | 決定 |
|---|---|
| 外枠 | `NavigationSplitView` をやめ、Web 版の `layout.tsx` と同じく 56pt の上部バーと 240pt のサイドバー。幅が 1280pt（Web の `xl`）未満ならメニューボタンで開く 288pt のドロワー |
| 上部バー | ブランド（黒い角丸のキーボード＋Typle）、保存先のバッジ、ライト／ダークの切り替え、アカウント（API に接続していなければ「アカウントに接続」、していれば丸いアイコン。どちらも「一般」へ） |
| サイドバー | Web 版の `navigation.ts` と同じ項目と並び。ヘルプの「使い方」「Typleについて」「GitHub」は Web 版をブラウザーで開く |
| 色・角丸 | `globals.css` の neutral の値（oklch を sRGB にしたもの）を `Design/Theme.swift` の `Palette` に。ページの背景 #FAFAFA／#1A1A1A、カード #FFFFFF／#171717 は Web 版の画面から測った値 |
| 部品 | shadcn の Card・Button（primary／outline／ghost）・Badge・Kbd と、Web 版の FilterMenu・ToggleGroup・検索欄を SwiftUI で作る |
| ページ | ホーム（ダッシュボード）、練習、練習記録、ベスト記録（一覧と詳細）、単語リスト、作成・編集（ページ）、一般、端末。それぞれ Web 版の同じページの並びと文言 |
| ホーム | `src/core/dashboard.ts` を `TypleCore/Dashboard.swift` に移し、同じテストを XCTest に移す |
| 単語の編集 | Web 版と同じく、入力する文字が表示と同じなら空欄で表示し、空欄は表示と同じとして保存する。並べ替えはドラッグと「…」メニュー |
| 言語 | 「一般」で日本語・English をその場で切り替える（`Localization` が選んだ言語の `.lproj` から読む）。既定は iPad の言語 |
| テーマ | 上部バーのボタンで、いま表示している明るさの反対に固定する（Web 版と同じ）。既定はシステム |
| 文言 | Web 版の `src/messages/{ja,en}` の文言を使い、iPad に合わない「このブラウザー」は「この iPad」に言い換える |
| 確認 | CI（`ios.yml`）で、サンプルデータ（`-TypleDemo YES`）の各ページを 11 インチ（横、1180×820pt）と 13 インチの iPad シミュレーターで撮り、成果物に残して Web 版と見比べる |

## 範囲外

- ガイド・Typleについてのページ（Web 版を開く）
- 日本語・英語以外の言語
- Web 版のキーボードショートカットのうち、単語の Alt+↑↓ 移動
