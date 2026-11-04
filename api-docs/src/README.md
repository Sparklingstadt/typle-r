---
home: true
title: ホーム
heroText: Typle API
tagline: Typle のバックエンド（Go）が提供する API の仕様
actions:
  - text: アプリのAPI
    link: /app/
    type: primary
  - text: API（Go・/api/v1）
    link: /v1/
    type: secondary
features:
  - title: アプリのAPI（/api/*）
    details: Web版と iPad・Mac・Android・Windows 版が使う本番のバックエンド。ログイン、ワークスペースの保存、練習記録、パックの共有、管理画面。
  - title: API（Go・/api/v1）
    details: スクリプトや別のアプリから、GitHub のトークンでアカウントのデータを読み書きする手元専用の API。本番には載せていません。
  - title: OpenAPI
    details: /api/workspace/records の本文・応答・エラーコードは OpenAPI 3.1 で定義し、Go とアプリの両方をテストで照合しています。
footer: Typle
---

## 2つの API

Typle のバックエンドは Go（`server/`）で、性格の違う2つの API があります。どちらも `server/internal/store`・`server/internal/workspace`・`server/internal/auth` を共有し、保存データの検証の規則は同じです。

| | [アプリのAPI](/app/) | [API（Go）](/v1/) |
|---|---|---|
| パス | `/api/auth/*`・`/api/workspace`・`/api/workspace/records`・`/api/shares`・`/api/shared`・`/api/admin/*`・`/api/health` | `/api/v1/*` |
| 使う人 | Typle 本体（Web版と iPad・Mac・Android・Windows 版） | スクリプト・別のアプリ |
| 動く場所 | 本番は Vercel の Go の関数（`api/index.go`）。手元は `server/cmd/typle-web` | 手元の `server/cmd/typle-api` だけ（本番には載せない） |
| 認証 | セッションの Cookie、またはアプリのトークン | GitHub の Fine-grained の個人用アクセストークン |
| 書き込み | ワークスペース全体の保存（`revision` で競合を検出）と、記録の追加・削除 | `-writable` で起動したときだけ。リスト・パック・端末・記録を1件ずつ |

## このサイトについて

このサイトは [VuePress v2](https://vuepress.vuejs.org/) で作っています。原稿はリポジトリの `api-docs/src` にあります。

```sh
cd api-docs
npm ci
npm run docs:dev    # http://localhost:8090 で確認
npm run docs:build  # api-docs/src/.vuepress/dist に書き出す
npm run docs:check  # ビルドしたページのリンクと見出しへのアンカーを検査する
```

公開先は Cloudflare Pages（プロジェクト `typle-api-docs`）です。v2.24.16 から自動では公開しません。アプリの本番デプロイの後、GitHub Actions の「Docs deploy」（`.github/workflows/docs-deploy.yml`）を main で手で実行して公開します（[リリースの手順](https://github.com/Sparklingstadt/typle-r/blob/main/docs/release-workflow.md)）。手元から公開はしません。

API を変えたら、同じ PR でこのサイトの該当ページも直してください。
