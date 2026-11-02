import { test, expect } from '@playwright/test'

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
  await page.route('**/api/admin/dashboard', route => route.fulfill({ json: {
    admin: { email: 'admin@example.com', sub: 'cadmin' },
    overview: {
      workspaces: 12, activeDay: 1, activeWeek: 4, activeMonth: 9, sharedPacks: 3,
      recentShares: [{ id: '00000000-0000-4000-8000-000000000001', ownerId: 'github:42', name: '', updatedAt: '2026-10-20T03:04:05Z' }],
      admins: [
        { email: 'admin@example.com', ffpfSub: 'cadmin', createdAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-20T03:04:05Z' },
        { email: 'new@example.com', ffpfSub: null, createdAt: '2026-10-02T00:00:00Z', lastSeenAt: null },
      ],
    },
  } }))
  const pages: string[] = []
  await page.route('**/api/admin/users?*', route => {
    const number = Number(new URL(route.request().url()).searchParams.get('page'))
    pages.push(String(number))
    const users = number === 0
      ? Array.from({ length: 50 }, (_, i) => ({ ownerId: `github:${1000 + i}`, lists: 5, packs: 2, devices: 1, shares: 0, revision: 8, updatedAt: '2026-10-20T03:04:05Z' }))
      : [{ ownerId: 'github:9', lists: 1, packs: 1, devices: 0, shares: 3, revision: 1, updatedAt: '2026-10-01T00:00:00Z' }]
    return route.fulfill({ json: { page: number, pageSize: 50, total: 51, users } })
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

// The gallery section: reported packs come first, hiding and showing re-read the list.
const dashboardAnswer = {
  admin: { email: 'admin@example.com', sub: 'cadmin' },
  overview: { workspaces: 1, activeDay: 0, activeWeek: 0, activeMonth: 0, sharedPacks: 0, recentShares: [], admins: [] },
}
const emptyUsers = { page: 0, pageSize: 50, total: 0, users: [] }
const packA = '00000000-0000-4000-8000-0000000000a1'
const packB = '00000000-0000-4000-8000-0000000000b2'

async function mockAdmin(page: import('@playwright/test').Page, gallery: () => unknown, hides: unknown[], unhides: unknown[], status = 204) {
  await page.route('**/api/admin/dashboard', route => route.fulfill({ json: dashboardAnswer }))
  await page.route('**/api/admin/users?*', route => route.fulfill({ json: emptyUsers }))
  await page.route('**/api/admin/gallery', route => route.fulfill({ json: gallery() }))
  await page.route('**/api/admin/gallery/hide', route => {
    hides.push(route.request().postDataJSON())
    return status === 204 ? route.fulfill({ status }) : route.fulfill({ status, json: { error: 'sharedPackNotFound' } })
  })
  await page.route('**/api/admin/gallery/unhide', route => {
    unhides.push(route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
}

test('the administrator sees reported packs first and hides one', async ({ page }) => {
  const hides: unknown[] = []
  let hidden = false
  await mockAdmin(page, () => ({ packs: [
    { id: packA, name: 'Reported pack', category: '英語', added: 7, listedAt: '2026-10-20T03:04:05Z', hiddenAt: hidden ? '2026-10-21T00:00:00Z' : null, reports: 3, reasons: { spam: 2, inappropriate: 1 } },
    { id: packB, name: '', added: 1, listedAt: '2026-10-19T03:04:05Z', hiddenAt: null, reports: 0, reasons: {} },
  ] }), hides, [])
  await page.route('**/api/admin/gallery/hide', route => { hidden = true; hides.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }) })
  await page.goto('/admin')
  const section = page.getByRole('region', { name: 'ギャラリー' })
  const rows = section.getByRole('row')
  await expect(rows.nth(1)).toContainText('Reported pack')
  await expect(rows.nth(1)).toContainText('英語')
  await expect(rows.nth(1)).toContainText('スパム・宣伝 2')
  await expect(rows.nth(1)).toContainText('不適切な内容 1')
  await expect(rows.nth(2).getByRole('link', { name: '（名前なし）' })).toHaveAttribute('href', `/shared/${packB}`)
  await expect(section.getByRole('link', { name: 'Reported pack' })).toHaveAttribute('href', `/shared/${packA}`)

  await rows.nth(1).getByRole('button', { name: '非公開にする' }).click()
  await expect(rows.nth(1).getByRole('button', { name: '戻す' })).toBeVisible()
  expect(hides).toEqual([{ id: packA }])
})

test('a hidden pack can be shown again', async ({ page }) => {
  const unhides: unknown[] = []
  let hidden = true
  await mockAdmin(page, () => ({ packs: [
    { id: packA, name: 'Hidden pack', added: 2, listedAt: '2026-10-20T03:04:05Z', hiddenAt: hidden ? '2026-10-21T00:00:00Z' : null, reports: 1, reasons: { other: 1 } },
  ] }), [], unhides)
  await page.route('**/api/admin/gallery/unhide', route => { hidden = false; unhides.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }) })
  await page.goto('/admin')
  const row = page.getByRole('region', { name: 'ギャラリー' }).getByRole('row').nth(1)
  await expect(row).toContainText('非公開')
  await row.getByRole('button', { name: '戻す' }).click()
  await expect(row.getByRole('button', { name: '非公開にする' })).toBeVisible()
  expect(unhides).toEqual([{ id: packA }])
})

test('a failed hide says so', async ({ page }) => {
  const hides: unknown[] = []
  await mockAdmin(page, () => ({ packs: [
    { id: packA, name: 'Some pack', added: 2, listedAt: '2026-10-20T03:04:05Z', hiddenAt: null, reports: 0, reasons: {} },
  ] }), hides, [], 404)
  await page.goto('/admin')
  const section = page.getByRole('region', { name: 'ギャラリー' })
  await section.getByRole('button', { name: '非公開にする' }).click()
  await expect(section.getByRole('alert')).toContainText('操作できませんでした')
  await expect(section.getByRole('button', { name: '非公開にする' })).toBeVisible()
  expect(hides).toEqual([{ id: packA }])
})
