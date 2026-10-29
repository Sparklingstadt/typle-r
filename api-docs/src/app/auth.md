# ログイン

ログインは GitHub（OAuth App）か FFPF ID（OpenID Connect）で、どちらも PKCE（S256）を使います。ログイン後のリクエストの扱いは [認証](./README.md#認証) を見てください。

## 流れ

- Web版：`/api/auth/signin` → GitHub か FFPF ID → `/api/auth/callback/*` → セッションの Cookie を発行して `returnTo` へ戻る。
- アプリ（iPad・Mac・Android・Windows）：`/api/auth/signin?client=…&code_challenge=…` → GitHub か FFPF ID → `/api/auth/callback/*` → `typle-r://login?code=<コード>` → アプリが `POST /api/auth/token` でコードと verifier をトークンに換える。
- 管理画面：`/api/auth/signin?admin=1` → FFPF ID → `/api/auth/callback/ffpf` → 管理者の Cookie を発行して `/admin` へ戻る（[管理画面](./admin.md)）。

## `GET /api/auth/signin`

| クエリ | 内容 |
|---|---|
| `provider` | `github`（既定）か `ffpf` |
| `returnTo` | ログイン後に戻るアプリ内のパス（既定 `/home`）。サイト内のパスでなければ既定にする |
| `client`・`code_challenge` | アプリのログイン。`client` は `ipad`・`macos`・`android`・`windows`、`code_challenge` はアプリが作った S256 のチャレンジ（43文字） |
| `admin=1` | 管理画面のログイン。`provider` によらず FFPF ID を通り、必ず `/admin` に戻る |

ログインの途中の状態（state・verifier・戻り先など）を署名した Cookie `typle-oauth`（`Path=/api/auth`、10分）に入れ、GitHub か FFPF ID へリダイレクト（`302`）します。そのログイン方法の設定がなければ `503 authUnavailable` です。

## ログインから戻る先

`GET /api/auth/callback/github`・`GET /api/auth/callback/ffpf` は、`typle-oauth` の Cookie を必ず消し、state が合い、ログイン先がアカウントを確かめたときだけログインして、`returnTo` へリダイレクトします。失敗しても理由は見せずに `returnTo` へ戻ります。

- Web版：セッションの Cookie を発行します。
- アプリ：Cookie は発行せず、`typle-r://login?code=<コード>`（失敗は `typle-r://login?error=loginFailed`）へ戻ります。コードは2分で切れます。
- 管理画面：`typle_admins` に登録されたアカウントなら管理者の Cookie を発行して `/admin` へ、そうでなければ `/admin?error=adminForbidden`、DB に聞けなければ `/admin?error=adminUnavailable` へ戻ります。アプリにはログインしません。

## `POST /api/auth/token`

アプリがログインの最後に、コードと自分の verifier をトークンに換えます。Cookie を使わないため `Origin` は要りません。

```json
// 本文（4KiB まで）
{ "code": "…", "verifier": "…" }
// 応答
{ "token": "…", "user": { "id": "github:123", "name": "…", "image": "https://…" } }
```

コードが切れている、verifier がチャレンジと合わないなど、どんな誤りも `400 loginFailed` で、アプリはログインをやり直します。トークンはセッションと同じく30日で切れます。

## `GET /api/auth/session`

```json
{ "user": { "id": "github:123", "name": "…", "image": null }, "providers": ["github", "ffpf"] }
```

- ログインしていなければ `user` は `null` です。`providers` は設定のあるログイン方法を `github`・`ffpf` の順に並べます。
- 無効にされたセッションは `user: null` で、Cookie を消します。この応答は DB を待たないため、すぐ確かめられないときは確かめずに答えます（データの読み書きは `signedIn` で必ず確かめます）。

## `POST /api/auth/signout`

`204` で、セッションの Cookie を消します。アプリの `Origin` が必要です。

`?everywhere=1` を付けると、このアカウントのそれまでのすべてのログイン（Cookie もアプリのトークンも）を無効にします。アプリはトークンで、`Origin` なしで呼べます。すでに無効にされたセッションからは `401 loginRequired`、DB に読み書きできなければ `503 databaseUnavailable`（Cookie は残すのでやり直せます）です。

::: warning
`?everywhere=1` は、盗まれたセッションを期限前に止める唯一の方法です。
:::

## `POST /api/auth/local`

開発用に `github:0`（「ローカル練習用」）としてログインし、`204` を返します。アプリの `Origin` が必要です。

手元の `typle-web` で、`LOCAL_DEVELOPMENT_LOGIN=1` かつ `AUTH_URL` がこの機械への `http`（またはそれと同じ `LOCAL_DEVELOPMENT_LAN_HOST` のプライベートIPv4）のときだけあり（`server/internal/web/config.go` の `localLoginAllowed`）、本番を含むほかでは `404 notFound` です。
