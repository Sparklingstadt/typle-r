# API（Go）

`/api/v1` の仕様は、v2.1.2 から VuePress のサイト [api-docs/src/v1](../api-docs/src/v1/README.md) に移しました。サイトは `cd api-docs && npm ci && npm run docs:dev` で見られます。

| 以前の章 | 移った先 |
|---|---|
| 冒頭・起動・認証 | [api-docs/src/v1/README.md](../api-docs/src/v1/README.md) |
| 共通事項 | [api-docs/src/v1/common.md](../api-docs/src/v1/common.md) |
| エンドポイント | [api-docs/src/v1/read.md](../api-docs/src/v1/read.md) |
| 書き込み・フォロー中の公式パック・アプリと同時に保存したとき | [api-docs/src/v1/write.md](../api-docs/src/v1/write.md) |
| リスト・パック・端末・記録の検証、パックのファイルと CSV・TSV の取り込み | [api-docs/src/v1/validation.md](../api-docs/src/v1/validation.md) |
| 例・コードの構成・開発・範囲外 | [api-docs/src/v1/development.md](../api-docs/src/v1/development.md) |

本番のアプリ自身のバックエンド（`/api/*`）は [api-docs/src/app](../api-docs/src/app/README.md) です。
