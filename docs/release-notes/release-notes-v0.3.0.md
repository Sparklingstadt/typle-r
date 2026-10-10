# v0.3.0 — Tailwind UIと依存関係の整理

v0.2.2で実装したTailwind CSSのUIを引き継ぐマイナーリリースです。

- Emotion・MUIの参照がソースとnpm依存に残っていないことを確認。
- 前版の削除後も残っていた不要なSass・Immutableを、インストール情報とpackage-lock.jsonから除去。
- 認証・PostgreSQL・Tailwind・テストに必要な依存、およびNext.js内部のstyled-jsxは維持。
- アプリ機能・保存形式は変更なし。

ローカル検証: 型チェック、単体8件、Lint、本番ビルド、実PostgreSQLを使うPlaywright E2E8件。

GitHub CIは再許可まで停止中です。Vercelデプロイも停止中で、Neon実接続と既存の依存関係の脆弱性に関する制約は継続します。
