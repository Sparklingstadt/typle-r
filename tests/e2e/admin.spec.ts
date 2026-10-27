import { test, expect } from '@playwright/test'

// The dashboard's own login and figures come from /api/admin/dashboard (server/internal/web/admin.go), whose cookie and
// typle_admins check are covered by the Go tests; here the page is checked against its answers.

test('without the administrator cookie the dashboard offers the GitHub login', async ({ page, request }) => {
  const response = await request.get('/api/admin/dashboard')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({ error: 'adminRequired' })

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '管理者ダッシュボード', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'GitHubでログイン' })).toHaveAttribute('href', '/api/auth/signin?admin=1')
  await expect(page.locator('[data-slot=alert]')).toHaveCount(0)
})

test('a login of another GitHub account is refused', async ({ page }) => {
  await page.goto('/admin?error=adminForbidden')
  await expect(page.locator('[data-slot=alert]')).toHaveText('このGitHubアカウントは管理者ではありません。')
  await expect(page.getByRole('link', { name: 'GitHubでログイン' })).toBeVisible()
})

test('the administrator sees the figures and can sign out', async ({ page }) => {
  await page.route('**/api/admin/dashboard', route => route.fulfill({ json: {
    admin: { login: 'sparklingstadt', githubId: 7 },
    overview: {
      workspaces: 12, activeDay: 1, activeWeek: 4, activeMonth: 9, sharedPacks: 3,
      recentWorkspaces: [{ ownerId: 'github:42', lists: 5, packs: 2, devices: 1, revision: 8, updatedAt: '2026-10-20T03:04:05Z' }],
      recentShares: [{ id: '00000000-0000-4000-8000-000000000001', ownerId: 'github:42', name: '', updatedAt: '2026-10-20T03:04:05Z' }],
      admins: [{ login: 'sparklingstadt', githubId: 7, createdAt: '2026-10-01T00:00:00Z', lastSeenAt: null }],
    },
  } }))
  let signedOut = false
  await page.route('**/api/auth/admin/signout', route => { signedOut = true; return route.fulfill({ status: 204 }) })
  await page.goto('/admin')
  await expect(page.getByText('sparklingstadt でログイン中')).toBeVisible()
  const stats = page.getByRole('region', { name: '概要' })
  await expect(stats.getByText('保存済みアカウント')).toBeVisible()
  await expect(stats.getByText('12', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'github:42' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: '（名前なし）' })).toHaveAttribute('href', '/shared/00000000-0000-4000-8000-000000000001')
  await expect(page.getByRole('cell', { name: '未ログイン' })).toHaveCount(0)

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByRole('link', { name: 'GitHubでログイン' })).toBeVisible()
  expect(signedOut).toBe(true)
})
