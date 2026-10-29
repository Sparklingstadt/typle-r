# 管理画面

`/admin` は FFPF ID でだけログインでき（`/api/auth/signin?admin=1`）、`typle_admins` にメールアドレスで登録されたアカウントだけが入れます。最初のログインでそのアカウントの `sub` を行に結び付けるため、後でそのメールアドレスを取った別人は入れません。

- 管理者の Cookie は `HttpOnly`・`SameSite=Strict` で、12時間で切れます（延びません）。セッションの Cookie とは別です。
- `/api/admin/*` は毎回 `typle_admins` を確かめます。Cookie がなければ `401 adminRequired`、登録が消えていれば Cookie を消して `403 adminForbidden` です。

## `GET /api/admin/dashboard`

```json
{
  "admin": { "email": "admin@example.com", "sub": "…" },
  "overview": {
    "workspaces": 120, "activeDay": 8, "activeWeek": 30, "activeMonth": 64, "sharedPacks": 15,
    "recentShares": [{ "id": "…", "ownerId": "github:123", "name": "Linux", "updatedAt": "…" }],
    "admins": [{ "email": "admin@example.com", "ffpfSub": "…", "createdAt": "…", "lastSeenAt": "…" }]
  }
}
```

`workspaces` は保存したアカウントの数、`activeDay`・`activeWeek`・`activeMonth` はそれぞれ1日・7日・30日以内に保存したアカウントの数です。`recentShares` は新しく更新した共有20件です。すべて1つの読み取り専用トランザクションで読みます。

## `GET /api/admin/users`

クエリ `page`（0から）でページを選びます。

```json
{ "page": 0, "pageSize": 50, "total": 120, "users": [{ "ownerId": "github:123", "lists": 12, "packs": 4, "devices": 2, "shares": 1, "revision": 40, "updatedAt": "…" }] }
```

新しく保存した順に50件ずつです。データの中身ではなく、件数だけを返します。`page` が0〜10000の整数でなければ `400 invalidPage` です。

## `POST /api/auth/admin/signout`

管理者の Cookie を消して `204` を返します。アプリの `Origin` が必要です。
