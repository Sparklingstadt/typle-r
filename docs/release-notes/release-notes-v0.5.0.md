# v0.5.0 — npm依存パッケージの更新

- Next.js 14.2.35 → 16.3.4、React / React DOM 18.3.1 → 19.2.8。
- Tailwind CSS 3.4.3 → 4.3.3と専用PostCSSプラグインへ移行。
- TypeScript 5.4.5 → 6.0.3、ESLint 8.57.0 → 9.39.5、React / Node型定義と間接依存を更新。
- Next.jsのTurbopack、ESLint CLI / flat configに対応。旧Pages Routerの_documentを削除しApp Routerへ統一。
- React 19の型変更と、アカウント切り替え時の状態初期化を修正。
- Prisma CLI内のdeepmerge-ts / mysql2を修正版へ限定override。npm auditの指摘は0件。

Prismaは正式版7.10、Auth.jsは既存の5.0.0-beta.32を維持。TypeScript 7 / ESLint 10はLintプラグインの互換範囲外のため不採用。Node型定義は実行環境に合わせ24系です。

ローカルで型チェック、Lint、単体・実DB8件、本番ビルド、Playwright E2E9件（上限10 workers）を検証。モバイル・デスクトップ表示とアカウント切り替えも確認しました。保存形式とDBスキーマの変更はありません。

Tailwind 4の対象ブラウザーはSafari 16.4+、Chrome 111+、Firefox 128+です。GitHub CIとVercelデプロイは停止を維持しています。Neon実接続は未検証です。
