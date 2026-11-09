# PRから本番公開まで

必須順序: **PR作成 → マージ（squash merge か普通のマージ） → マージ後のverify（手元の `npm run verify`） → GitHub Release → Vercel本番デプロイ**。

v2.38.1 から GitHub Actions は使いません（API の文書を公開する「Docs deploy」だけ残しています）。それまで `.github/workflows/ci.yml` の
`policy → verify → release → deploy` が行っていた検査・Release・デプロイは、すべてマージした人の手元（Mac）で、この順に手で行います。
verify は `npm run verify`（`scripts/verify.cjs`）の1コマンドです。CI の verify と同じ検査（DB更新・マイグレーションのテスト・Goの検査とDBテスト・
型チェック・単体テスト・Lint・knip・本番ビルド・E2E・APIの文書のビルドとリンク検査）を同じ順に流し、最初の失敗で止まります。
PR の前にも手元で `npm run verify` を通し、マージ後の main のコミットでもう一度通してから公開します。

## 初回設定

1. GitHubの **Settings → General → Pull Requests** で、Allow squash mergingを有効にし、
   Allow rebase mergingを無効にします。普通のマージを使うときはAllow merge commitsも有効にします。
2. **Settings → Rules → Rulesets** でmainを対象とした有効なルールを作ります。
   PR必須、ブランチを最新にすることを必須にし、force push・削除禁止、bypass対象なしを設定します。
   required status check は v2.38.1 からありません。
   private repoのプラン等によりルールを強制できない場合、mainへの直接pushは運用で禁止します。
3. 公開する Mac を準備します。README の「Dockerでの仮運用」のとおり Node.js 24・Go 1.25・Docker Compose と `.env.local` を用意し、
   Release を作る `gh auth login`（リポジトリへの書き込み権限）と、デプロイする `vercel login`・`vercel link`
   （`.vercel/project.json` が本番のプロジェクトを指すこと）を済ませます。`.vercel/`・トークン・`.env.local` はコミットしません。
   それまで Actions の `production` Environment に置いていた `VERCEL_TOKEN`・`VERCEL_ORG_ID`・`VERCEL_PROJECT_ID` は使わないので、削除してかまいません。
4. 対象VercelプロジェクトのProduction環境にDB・Authの環境変数を設定します。
   READMEの「Neon / Vercelの構成」を参照してください。
   公開先は`https://typle.sparklingstadt.com`です（v2.33.0 から。`SITE_URL`・`AUTH_URL` にこの URL を設定します）。
   Vercel のドメイン`https://typle-r-six.vercel.app`も残し、iPad・Mac 版はそこの`/api/*`を呼びます。
5. API の文書（`api-docs/`）を Cloudflare Pages に公開するため、**Settings → Environments** で`production`を作り（deployment branchをmainに限定）、次の2つを登録します。
   - `CLOUDFLARE_API_TOKEN`: 対象アカウントの **Cloudflare Pages: Edit** の権限だけを持つ API トークン。期限を付けてください。
   - `CLOUDFLARE_ACCOUNT_ID`: 対象アカウントのID。
   Pages のプロジェクト `typle-api-docs` は、なければ最初の`docs-deploy`（`.github/workflows/docs-deploy.yml`）が作ります。Cloudflare の Git 連携は使いません。
6. `vercel.json`の`git.deploymentEnabled: false`を維持します。
   公開は下の手順の `vercel deploy --prod` だけで行い、Vercel の Git 連携・Deploy Hook・別の workflow は併用しません。

Release の作成と Vercel の操作は手で行うため、順序を YAML で守ることはできません。
書き込み権限とVercel権限を、この運用に従う利用者に限定してください。

## 現在の導入状態

2026-09-29時点で、非公開repoのプラン制限によりmainのRulesets・branch protection APIは403です。
マージの方法の設定は利用できます。
現プランではmainへの直接push自体は防げないため、運用で禁止します。
GitHub Proへ変更した場合は、上記のmain保護ルールを追加してください。
本番ビルドのNode.jsは24系です。`package.json` の `engines` を `"24.x"` に固定しています（v2.6.5 から）。`">=24.0.0"` のような上限のない指定では、Vercel が新しいメジャー版（26系）を自動で選び、手元の verify（24系）と食い違うためです。

## 毎回の開発

1. mainから作業ブランチを作り、コード変更とバージョン更新を行います。
   `npm version 0.18.2 --no-git-tag-version`のように、未使用の安定版`X.Y.Z`を指定します（`git tag` と GitHub の Releases で未使用を確かめます）。
   package.jsonとpackage-lock.jsonを両方コミットしてください。
2. 手元で `npm run verify` を通してから PR を作成し、変更内容を確認します。
   作業中の確認には E2E と API の文書を省く `npm run verify -- --fast` が使えますが、PR の前は省かずに通します。
3. マージします。既定はsquash mergeで、コミットの履歴を残したいPRは普通のマージにします。普通のマージでは、マージコミットのタイトルをPRのタイトルと同じにします。
   前のmainの公開（Release とデプロイ）が完了するまでは次のPRをマージしません。
4. 公開する Mac で main を最新にします（`git switch main && git pull --ff-only`）。HEAD がその PR のコミットであること
   （squash mergeは1コミットで親が1つ、普通のマージは親が2つで第2親がPRのhead）と、`git status` に変更がないことを確かめます。
5. そのコミットで `npm run verify` を省かずに通します。手元の PostgreSQL（`docker compose --env-file .env.local up -d --wait`）の
   `DATABASE_URL` にマイグレーションを適用し、DBテストと E2E もそのDBを使います（テストはランダムな所有者の行を足して、終わりに消します）。
   失敗したら公開せず、新しいバージョンで修正PRを出して同じ順序でやり直します。
6. 同じコミットに `v<package.jsonのversion>` のタグと公開済みの通常Releaseを作ります。Release notes はGitHubの自動生成を使います。

   ```bash
   gh release create "v$(node -p "require('./package.json').version")" --target "$(git rev-parse HEAD)" --title "v$(node -p "require('./package.json').version")" --generate-notes --latest
   ```

   公開済みとは非draftの意味で、repoの非公開設定は変えません。タグを動かしたり、同じバージョンを別のコミットに使ったりしません。
7. 同じチェックアウトから `vercel deploy --prod --yes` でソースを送り、Vercel内で本番ビルド・デプロイします（`vercel.json` の
   `npm run db:migrate && npm run build`）。読み出し不可のSecretが`[SENSITIVE]`になるため、`vercel pull`・`vercel build` はしません。
8. 本番のドメインが新しいデプロイを返すまで待ちます。`vercel deploy --prod` は、ドメインがまだ前のデプロイを返しているうちに終わることがあり、
   前のデプロイにもあるパスは同じ応答になるため、そのままでは確認が新しいデプロイを見ません。`vercel inspect typle-r-six.vercel.app` が
   `vercel deploy` の出力した URL のデプロイを指すまで待ちます。
   そのあと `npm run check:production`（`scripts/check-production.cjs`）で次を確かめます。1つでも失敗すれば終了コード1です。
   本番（`https://typle.sparklingstadt.com`）のホームの成功応答、Vercel のドメインのページが本番へ308で移ること（クエリも残す）、
   両方のドメインで Goの関数が返す`/api/health`の200（本番DBへの接続を含む）と匿名APIアクセスの401。
   ログインの関数も確かめます。`/api/auth/session`が200で、本文の`user`が`null`、`providers`が`"github"`を含む配列であること（FFPF IDを設定している場合は`"ffpf"`も入りますが、確認はしません）、
   `/api/auth/signin`がリダイレクトを辿らずに302を返し、`Location`が`https://github.com/login/oauth/authorize?`で始まり
   本番の`redirect_uri`（`https://typle.sparklingstadt.com/api/auth/callback/github`）を含むことです。
   これにより、本番の関数で`AUTH_SECRET`・`AUTH_URL`・`AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET`が揃って設定されていることまで確かめます。
   Vercel のドメインで始めたログイン（iPad・Mac 版）が、クエリを残したまま本番の`/api/auth/signin`へ307で移ることと、
   iPad のログインの`POST /api/auth/token`が Vercel のドメインで本文`{}`に`400`と`{"error":"loginFailed"}`を返すことも確かめます。
   v2.38.0 までは CI の deploy ジョブが同じ確認をしていました。
9. API の文書（`api-docs/`）は、v2.25.2 から CI では公開せず、必要なときに手で公開します。Vercel のデプロイが成功した後、
   Actions の「Docs deploy」を main で実行します（Run workflow。`docs-deploy.yml`、main 以外では何もしません）。
   main の最新のコミットの文書をビルドし、リンクを検査して、固定版の Wrangler（`docs-deploy.yml`の`WRANGLER_VERSION`）で
   Cloudflare Pages の`typle-api-docs`に公開し、公開後に主なページが返ることを確かめます。
   文書の公開が失敗してもアプリの公開には影響しません。原因を直して「Docs deploy」を再実行します。
   文書のビルドとリンクの検査は `npm run verify` でも行います。

verifyのDBは手元のDBですが、`vercel deploy --prod` から起動するVercel上のビルドは本番環境変数を使います。
`vercel.json`に従い、ここで本番DBへmigrationが適用されます。DB更新に成功した後で
ビルドやデプロイが失敗することもあるため、migrationは旧アプリと互換性のある変更にします。
DBの自動ロールバックは行いません。

`npm run db:migrate`（`scripts/migrate.cjs`）は `db/migrations` の SQL を名前の順に適用します。v2.36.19 までは `prisma migrate deploy` で適用していたため、
履歴は今も同じ `_prisma_migrations` テーブルに、同じ形で残します。適用する前にこのテーブルを読み、手元にない新しいマイグレーション
（手元の最新より後の名前で、適用済みのもの）があれば何も適用せずに失敗します（v2.5.8 から）。
古いコミットを本番へデプロイすると、古いマイグレーションを未適用とみなして本番DBへ流そうとするためです
（2026-10-31 に v0.99.4 のソースを手元からデプロイし、`0002_practice_devices` が本番DBで失敗して、
後のデプロイが `P3009` で止まりました）。0027_schema にまとめた 0001〜0026 のような、手元にない古い記録は問題にしません。
この確認は v2.5.8 以降のコードにしかないため、それより前のコミットは今も本番へデプロイしないでください。
前のデプロイへ戻すときは、ビルドをしない Vercel の Instant Rollback を使うか、新しいバージョンの修正PRを出します。

## マイグレーションの失敗

マイグレーションは1本ごとに1つのトランザクションで、SQL とその記録を一緒に確定します。失敗すると DB はその1本の前の状態に戻り、記録も残りません。
そのため `CREATE INDEX CONCURRENTLY` のようにトランザクションの中で実行できない SQL は書けません。

本番では Vercel のビルドの `npm run db:migrate` が失敗し、デプロイが止まります。今の本番のアプリと DB はそのまま動き続けます。ログの1行目で原因を見分けます。

| ログ | 意味 | 直し方 |
|---|---|---|
| `<名前> failed and was rolled back: …` | その SQL が本番のデータで失敗した。DB は変わっていない | SQL を直す。まだ適用されていないので、同じマイグレーションを直した新しいバージョンの PR を出す |
| `The database has migrations this checkout does not have` | DB より古いコードをデプロイした。何も適用していない | 最新の main をデプロイする |
| `The database records failed migrations` | `_prisma_migrations` に失敗の行がある（v2.36.19 までの Prisma の記録）。何も適用していない | 下の手順で記録を直す |
| `This database has tables but no migration history` | 接続先が違う。何も適用していない | `DIRECT_URL`・`DATABASE_URL` を確かめる |
| `Another migration is still running` | 別の実行が30秒たっても終わらない | 終わるのを待ち、デプロイをやり直す |

失敗の行を直す手順は次のとおりです（2026-10-31 の `0002_practice_devices` がこの例です）。本番の接続文字列は `vercel env pull --environment=production` で取り出します。

1. 行を確かめます。`finished_at` が空で `rolled_back_at` も空の行が失敗の行です。

   ```sql
   SELECT migration_name, started_at, finished_at, rolled_back_at, logs FROM _prisma_migrations
   WHERE finished_at IS NULL AND rolled_back_at IS NULL;
   ```

2. その SQL が DB を途中まで変えていないかを `logs` とテーブルの定義で確かめます。途中まで変えていたら、先に手で元に戻すか、残りを手で済ませます。
3. 記録を直します。適用し直すなら `rolled_back_at` を入れ、手で最後まで済ませたなら `finished_at` を入れます。

   ```sql
   UPDATE _prisma_migrations SET rolled_back_at = now()
   WHERE migration_name = '<名前>' AND finished_at IS NULL AND rolled_back_at IS NULL;
   ```

4. `vercel deploy --prod` をやり直し、手順の確認を続けます。

適用済みのマイグレーションのファイルは書き換えません。書き換えると、`db:migrate` が警告を出します（止まりはしません）。変更は新しいマイグレーションで行います。

## 失敗時

- PR の前の verify 失敗: 直してから PR を出します。
- マージ後の verify 失敗: 公開に進みません。新しいバージョンで修正PRを作り、同じ順序で公開します。
- Release作成失敗: デプロイに進みません。タグだけできていれば、同じコミットを指していることを確かめてから Release を作り直します。
- deploy失敗: 先に作成したReleaseは残ります。Releaseの存在だけでは本番反映成功を意味しません。原因を直して、同じコミットの `vercel deploy --prod` をやり直します。
- docs-deploy失敗: アプリの本番には影響しません。Secretやトークンの権限を直し、「Docs deploy」を再実行します。手元から`wrangler`で公開しません。
- 認証・通信などの一時的な問題: 原因を直して、失敗した手順からやり直します。
  既存Releaseは非draft・非prerelease・同じタグ・同じSHAの場合だけそのまま使います。
  タグを移動したり、同じバージョンを別コミットに使ったりしません。
- コード修正が必要: 新しいバージョンで修正PRを作り、同じ順序で公開します。
- 公開の途中でmainが進んだ: 古いコミットの Release・デプロイは行わず、最新の main を verify からやり直します。古いコミットを公開して巻き戻しません。
- HTTPチェックだけ失敗: デプロイ済みの可能性があるため、実際の公開状態を確認してから復旧します。
- v1.3.0 より前のバージョンへ戻す: 練習記録は `typle_records` に移っているため、戻す前に本番DBへ
  `scripts/records-rollback.sql` を実行して記録をリストへ戻します（[設計](superpowers/specs/2026-10-29-record-table.md)）。

常に1件ずつマージから公開完了まで進めてください。

## 検証と参考資料

手順を変えたときは、このファイルと `CLAUDE.md` の「Release workflow」、`scripts/verify.cjs`・`scripts/check-production.cjs` を合わせます。

- [GitHub CLI: gh release create](https://cli.github.com/manual/gh_release_create)
- [Vercel CLI: vercel deploy](https://vercel.com/docs/cli/deploy)
