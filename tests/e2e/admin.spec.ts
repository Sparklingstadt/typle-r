import { test, expect } from '@playwright/test'
import { GRAPHQL, operationOf } from './graphql'

// The dashboard's own login and figures come from /api/admin/dashboard (server/internal/web/admin.go), whose cookie and
// typle_admins check are covered by the Go tests; here the page is checked against its answers.

test('without the administrator cookie the dashboard offers the FFPF ID login', async ({ page, request }) => {
  const response = await request.get('/api/admin/dashboard')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ error: 'adminRequired' })

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '管理者ダッシュボード', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'FFPF IDでログイン' })).toHaveAttribute('href', '/api/auth/signin?admin=1')
  await expect(page.getByRole('link', { name: 'GitHubでログイン' })).toHaveCount(0)
  await expect(page.locator('[data-slot=alert]')).toHaveCount(0)
})

test('a login of an account that is not an administrator is refused', async ({ page }) => {
  await page.goto('/admin?error=adminForbidden')
  await expect(page.locator('[data-slot=alert]')).toHaveText('このFFPF IDは管理者ではありません。')
  await expect(page.getByRole('link', { name: 'FFPF IDでログイン' })).toBeVisible()
})

test('a login whose administrator check could not be made says so', async ({ page }) => {
  await page.goto('/admin?error=adminUnavailable')
  await expect(page.locator('[data-slot=alert]')).toHaveText('管理者かどうかを確認できませんでした。しばらくしてからもう一度お試しください。')
  await expect(page.getByRole('link', { name: 'FFPF IDでログイン' })).toBeVisible()
})

test('an unknown error in the URL is not shown', async ({ page }) => {
  await page.goto('/admin?error=somethingElse')
  await expect(page.getByRole('link', { name: 'FFPF IDでログイン' })).toBeVisible()
  await expect(page.locator('[data-slot=alert]')).toHaveCount(0)
})

test('the administrator sees the figures and can sign out', async ({ page }) => {
  const dashboard = {
    admin: { email: 'admin@example.com', sub: 'cadmin' },
    overview: {
      workspaces: 12, activeDay: 1, activeWeek: 4, activeMonth: 9, sharedPacks: 3,
      recentShares: [{ id: '00000000-0000-4000-8000-000000000001', ownerId: 'github:42', name: '', updatedAt: '2026-10-20T03:04:05Z' }],
      admins: [
        { email: 'admin@example.com', ffpfSub: 'cadmin', createdAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-20T03:04:05Z' },
        { email: 'new@example.com', ffpfSub: null, createdAt: '2026-10-02T00:00:00Z', lastSeenAt: null },
      ],
    },
  }
  const pages: string[] = []
  await page.route(GRAPHQL, route => {
    const operation = operationOf(route.request())
    if (operation === 'AdminDashboard') return route.fulfill({ json: { data: { adminDashboard: dashboard } } })
    if (operation !== 'AdminUsers') return route.continue()
    const number = Number(route.request().postDataJSON().variables.page)
    pages.push(String(number))
    const users = number === 0
      ? Array.from({ length: 50 }, (_, i) => ({ ownerId: `github:${1000 + i}`, lists: 5, packs: 2, devices: 1, shares: 0, revision: 8, updatedAt: '2026-10-20T03:04:05Z' }))
      : [{ ownerId: 'github:9', lists: 1, packs: 1, devices: 0, shares: 3, revision: 1, updatedAt: '2026-10-01T00:00:00Z' }]
    return route.fulfill({ json: { data: { adminUsers: { page: number, pageSize: 50, total: 51, users } } } })
  })
  let signedOut = false
  await page.route('**/api/auth/admin/signout', route => { signedOut = true; return route.fulfill({ status: 204 }) })
  await page.goto('/admin')
  await expect(page.getByText('admin@example.com でログイン中')).toBeVisible()
  const stats = page.getByRole('region', { name: '概要' })
  await expect(stats.getByText('保存済みアカウント')).toBeVisible()
  await expect(stats.getByText('12', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'github:42' })).toBeVisible()

  const users = page.getByRole('navigation', { name: 'ユーザー一覧のページ' })
  await expect(users).toContainText('51件中 1〜50件')
  await expect(users.getByRole('button', { name: '前へ' })).toBeDisabled()
  await expect(page.getByText('github:1049')).toBeVisible()
  await users.getByRole('button', { name: '次へ' }).click()
  await expect(users).toContainText('51件中 51〜51件')
  await expect(users).toContainText('2 / 2ページ')
  await expect(page.getByText('github:9', { exact: true })).toBeVisible()
  await expect(users.getByRole('button', { name: '次へ' })).toBeDisabled()
  expect(pages).toEqual(['0', '1'])
  await expect(page.getByRole('link', { name: '（名前なし）' })).toHaveAttribute('href', '/shared/00000000-0000-4000-8000-000000000001')
  const admins = page.getByRole('row', { name: /new@example\.com/ })
  await expect(admins.getByRole('cell', { name: '未ログイン' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'cadmin', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByRole('link', { name: 'FFPF IDでログイン' })).toBeVisible()
  expect(signedOut).toBe(true)
})
