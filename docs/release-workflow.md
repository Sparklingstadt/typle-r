# PRから本番公開まで

必須順序: **PR作成 → マージ（squash merge か普通のマージ） → マージ後のverify → GitHub Release → Vercel本番デプロイ**。

`.github/workflows/ci.yml` の `policy → verify → release → deploy` が順番を制御します。
PR・devへのpush・手動実行は検証のみで、公開はmainへのpushイベントに限定します。
PR時のverifyに合格しても、マージ後のverifyは必ず再実行します。
Releaseイベントで別のworkflowを起動する方式ではないため、GITHUB_TOKENで作ったReleaseから
別のworkflowが起動しない制限にも依存しません。

## 初回設定（このファイルの追加だけでは完了しません）

1. GitHubの **Settings → General → Pull Requests** で、Allow squash mergingを有効にし、
   Allow rebase mergingを無効にします。policyでもこの状態を確認します。
   普通のマージを使うときはAllow merge commitsも有効にします。policyはこの設定を問いません。
2. **Settings → Rules → Rulesets** でmainを対象とした有効なルールを作ります。
   PR必須、required status checkに`verify`、ブランチを最新にすることを必須にし、
   force push・削除禁止、bypass対象なしを設定します。
   初回PRでcheckが出てから`verify`を選択してください。
   private repoのプラン等によりルールを強制できない場合、YAMLだけでは直接pushを禁止できません。
   policyは直接push後の公開を拒否しますが、pushそのものを取り消す機能ではありません。
3. **Settings → Environments** で`production`を作成し、deployment branchをmainに限定します。
   以下の3つをEnvironment secretsへ登録します（repository secretsでも動作します）。
   - `VERCEL_TOKEN`: 対象チームを操作できる90日期限のトークン（CLIの制約によりチームスコープを使用）。
   - `VERCEL_ORG_ID`: 対象チームID。
   - `VERCEL_PROJECT_ID`: 対象プロジェクトID。
   IDは対象のVercel設定や、正しく紐付け済みの`.vercel/project.json`で確認します。
   `.vercel/`やトークンをコミットする必要はありません。
4. Actionsが利用可能で、workflowの`contents: write`が組織ポリシー等で禁止されていないことを確認します。
   Release作成にはジョブのGITHUB_TOKENを使うため、GitHub PATは不要です。
5. 対象VercelプロジェクトのProduction環境にDB・Authの環境変数を設定します。
   READMEの「Neon / Vercelの構成」を参照してください。
   公開先は`https://typle-r-six.vercel.app`を想定しています。
6. API の文書（`api-docs/`）を Cloudflare Pages に公開するため、`production` Environment に次の2つを登録します。
   - `CLOUDFLARE_API_TOKEN`: 対象アカウントの **Cloudflare Pages: Edit** の権限だけを持つ API トークン。期限を付けてください。
   - `CLOUDFLARE_ACCOUNT_ID`: 対象アカウントのID。
   Pages のプロジェクト `typle-api-docs` は、なければ最初の`docs-deploy`（`.github/workflows/docs-deploy.yml`）が作ります。Cloudflare の Git 連携は使いません。
7. `vercel.json`の`git.deploymentEnabled: false`を維持します。
   別のデプロイworkflow・Deploy Hook・手動CLIによる公開は併用しません。

管理者によるルール変更や手動Release・Vercel操作までYAMLだけで禁止することはできません。
書き込み権限とVercel権限も、この運用に従う利用者・自動化に限定してください。

## 現在の導入状態

2026-09-29時点で、非公開repoのプラン制限によりmainのRulesets・branch protection APIは403です。
マージの方法の設定とproduction Environmentのmain限定は利用できます。
現プランではmainへの直接push自体は防げませんが、policyでRelease・deployを拒否します。
GitHub Proへ変更した場合は、上記のmain保護ルールを追加してください。
CI用Vercelトークンは90日期限で作成しています。期限前にSecretを更新してください。
本番ビルドのNode.jsは24系です。`package.json` の `engines` を `"24.x"` に固定しています（v2.6.5 から）。`">=24.0.0"` のような上限のない指定では、Vercel が新しいメジャー版（26系）を自動で選び、CI の verify（24系）と食い違うためです。

## 毎回の開発

1. mainから作業ブランチを作り、コード変更とバージョン更新を行います。
   `npm version 0.18.2 --no-git-tag-version`のように、未使用の安定版`X.Y.Z`を指定します。
   package.jsonとpackage-lock.jsonを両方コミットしてください。
2. PRを作成し、verifyの結果と変更内容を確認します。
3. マージします。既定はsquash mergeで、コミットの履歴を残したいPRは普通のマージにします。普通のマージでは、マージコミットのタイトルをPRのタイトルと同じにします。
   前のmainのRelease・デプロイが完了するまでは次のPRをマージしません。
4. マージ後のpolicyがPRとの対応、第1親が直前のmainであること、マージの設定を確認します。squash mergeは1コミットのpushで親が1つ、普通のマージは親が2つで第2親がPRのheadであることも確認します。
5. verifyが一時PostgreSQLでDB更新・型チェック・単体/DBテスト・Lint・ビルド・E2Eを実行します。
   E2E用のChromiumはPlaywrightのバージョンごとにActionsのキャッシュに保存し、OSの依存パッケージだけ毎回入れます。
6. 成功したSHAに対して`v<package.jsonのversion>`のタグと公開済みの通常Releaseを作ります。
   Release notesはGitHubの自動生成を使います。公開済みとは非draftの意味で、repoの非公開設定は変えません。
7. 同じSHAをチェックアウトし、ReleaseのタグのSHAを再確認します。
   Vercel CLI 60.1.3の`vercel deploy --prod`でソースを送り、Vercel内で本番ビルド・デプロイします。
   CLIはバージョンごとにmainのキャッシュに保存します。版を上げるときは`ci.yml`の`VERCEL_CLI_VERSION`だけを変えます。
   CLIはインストールスクリプトを実行せずに入れ、`VERCEL_TOKEN`はSecretの確認、デプロイ、次の待機の手順だけに渡します。
   読み出し不可のSecretが`[SENSITIVE]`になるため、Actionsでは`vercel pull`・`vercel build`を行いません。
8. 本番のドメインが新しいデプロイを返すまで待ちます（v0.56.1 から）。`vercel deploy --prod` は、ドメインがまだ前のデプロイを返しているうちに終わることがあり、
   前のデプロイにもあるパスは同じ応答になるため、そのままでは確認が新しいデプロイを見ません。Vercel の API
   （`GET /v13/deployments/typle-r-six.vercel.app`）で本番のドメインが指すデプロイを調べ、`vercel deploy` が返したデプロイの URL と
   一致するまで5秒ごとに最大5分待ちます。一致しなければ失敗します。v2.5.10 より前は本番の `/home` の `data-dpl-id` で比べていましたが、
   Next.js がこの属性を書くのは Skew Protection が有効なときだけで、このプロジェクトでは書かれなくなっていたため、
   v2.5.8 の deploy がここで失敗しました（デプロイ自体は成功していました）。
   その後、本番ホームの成功応答、Goの関数が返す`/api/health`の200（本番DBへの接続を含む）、匿名APIアクセスの401を確認します。
   ログインの関数も確認します。`/api/auth/session`が200で、本文の`user`が`null`、`providers`が`"github"`を含む配列であること（FFPF IDを設定している場合は`"ffpf"`も入りますが、確認はしません）、
   `/api/auth/signin`がリダイレクトを辿らずに302を返し、`Location`が`https://github.com/login/oauth/authorize?`で始まり
   本番の`redirect_uri`（`https://typle-r-six.vercel.app/api/auth/callback/github`）を含むことです。
   これにより、本番の関数で`AUTH_SECRET`・`AUTH_URL`・`AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET`が揃って設定されていることまで確かめます。
   iPad のログインの`POST /api/auth/token`が、本文`{}`に`400`と`{"error":"loginFailed"}`を返すことも確かめます。
9. API の文書（`api-docs/`）は、v2.25.2 から CI では公開せず、必要なときに手で公開します。Vercel のデプロイが成功した後、
   Actions の「Docs deploy」を main で実行します（Run workflow。`docs-deploy.yml`、main 以外では何もしません）。
   main の最新のコミットの文書をビルドし、リンクを検査して、固定版の Wrangler（`docs-deploy.yml`の`WRANGLER_VERSION`）で
   Cloudflare Pages の`typle-api-docs`に公開し、公開後に主なページが返ることを確かめます。
   文書の公開が失敗してもアプリの公開には影響しません。原因を直して「Docs deploy」を再実行します。
   文書のビルドとリンクの検査は、PR を含むすべての verify でも行います。

verifyのDBは一時DBですが、deployから起動するVercel上のビルドは本番環境変数を使います。
`vercel.json`に従い、ここで本番DBへmigrationが適用されます。DB更新に成功した後で
ビルドやデプロイが失敗することもあるため、migrationは旧アプリと互換性のある変更にします。
DBの自動ロールバックは行いません。

`npm run db:migrate` は、適用する前に DB の `_prisma_migrations` を読み、手元にない新しいマイグレーション
（手元の最新より後の名前で、適用済みのもの）があれば何も適用せずに失敗します（v2.5.8 から）。
古いコミットを本番へデプロイすると、古いマイグレーションを未適用とみなして本番DBへ流そうとするためです
（2026-10-31 に v0.99.4 のソースを手元からデプロイし、`0002_practice_devices` が本番DBで失敗して、
後のデプロイが `P3009` で止まりました）。0027_schema にまとめた 0001〜0026 のような、手元にない古い記録は問題にしません。
この確認は v2.5.8 以降のコードにしかないため、それより前のコミットは今も本番へデプロイしないでください。
前のデプロイへ戻すときは、ビルドをしない Vercel の Instant Rollback を使うか、新しいバージョンの修正PRを出します。

## 失敗時

- policyまたはverify失敗: Releaseとデプロイは実行されません。
- Release作成失敗: デプロイは実行されません。
- deploy失敗: 先に作成したReleaseは残ります。Releaseの存在だけでは本番反映成功を意味しません。
- docs-deploy失敗: アプリの本番には影響しません。Secretやトークンの権限を直し、「Docs deploy」を再実行します。手元から`wrangler`で公開しません（次の課金制限の例外だけは手元から公開します）。
- GitHub の課金制限でジョブが起動しない（注釈が「The job was not started because recent account payments have failed or your spending limit needs to be increased」）: 例外として手動で公開します。verify と同じ検査を手元で行い、マージ、Releaseの作成、Vercel本番デプロイと確認、API の文書の公開を同じ順序で行います。手順は `CLAUDE.md` の「Exception: GitHub Actions blocked by billing」を見てください。ほかの失敗では手動で公開しません。
- 認証・通信などの一時的な問題: 原因を直して同じActions実行の失敗ジョブを再実行します。
  既存Releaseは非draft・非prerelease・同じタグ・同じSHAの場合だけ再利用します。
  タグを移動したり、同じバージョンを別コミットに使ったりしません。
- コード修正が必要: 新しいバージョンで修正PRを作り、同じ順序で公開します。
- mainが進んだ古い実行: Release作成・deployは拒否します。古い実行を再実行して巻き戻しません。
- HTTPチェックだけ失敗: デプロイ済みの可能性があるため、実際の公開状態を確認してから復旧します。
- v1.3.0 より前のバージョンへ戻す: 練習記録は `typle_records` に移っているため、戻す前に本番DBへ
  `scripts/records-rollback.sql` を実行して記録をリストへ戻します（[設計](superpowers/specs/2026-10-29-record-table.md)）。

workflow全体はmainごとに直列化し、実行中の公開を新しいpushでキャンセルしません。
待機中の実行は追加pushで置き換わる場合があります。また、mainが先に進んだ実行は上記の通り停止します。
常に1件ずつマージから公開完了まで進めてください。

## 検証と参考資料

設定変更時: `node --test scripts/ci/release.test.cjs` と `actionlint` を実行します。
実際のGitHub権限・Secrets・Vercel本番デプロイは、設定後の最初の承認済みPRで確認します。

- [GitHub Actionsのジョブ依存関係](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub Actionsの同時実行制御](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [VercelとGitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)
