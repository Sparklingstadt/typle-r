---
home: true
title: ホーム
heroText: Typle API
tagline: Typle のバックエンド（Go）が提供する API の仕様
actions:
  - text: アプリのAPI
    link: /app/
    type: primary
features:
  - title: アプリのAPI（/api/*）
    details: Web版と iPad・Mac・Android・Windows 版が使う本番のバックエンド。ログイン、ワークスペースの保存、練習記録、パックの共有、管理画面。
  - title: OpenAPI
    details: /api/workspace/records の本文・応答・エラーコードは OpenAPI 3.1 で定義し、Go とアプリの両方をテストで照合しています。
footer: Typle
---

## API

Typle のバックエンドは Go（`server/`）です。本番は Vercel の Go の関数（`api/index.go`）で、手元は `server/cmd/typle-web` で動きます。使うのは Typle 本体（Web版と iPad・Mac・Android・Windows 版）だけで、認証はセッションの Cookie かアプリのトークンです。

手元専用の `/api/v1`（`typle-api`）は v2.36.20 でなくしました。

## このサイトについて

このサイトは [VuePress v2](https://vuepress.vuejs.org/) で作っています。原稿はリポジトリの `api-docs/src` にあります。

```sh
cd api-docs
npm ci
npm run docs:dev    # http://localhost:8090 で確認
npm run docs:build  # api-docs/src/.vuepress/dist に書き出す
npm run docs:check  # ビルドしたページのリンクと見出しへのアンカーを検査する
```

公開先は Cloudflare Pages（プロジェクト `typle-api-docs`）です。v2.25.2 から自動では公開しません。アプリの本番デプロイの後、GitHub Actions の「Docs deploy」（`.github/workflows/docs-deploy.yml`）を main で手で実行して公開します（[リリースの手順](https://github.com/Sparklingstadt/typle-r/blob/main/docs/release-workflow.md)）。手元から公開はしません。

API を変えたら、同じ PR でこのサイトの該当ページも直してください。
