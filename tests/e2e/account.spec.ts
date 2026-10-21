import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { sealSession } from './sessionCookie'
const origin = 'http://127.0.0.1:3101'
const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
// The Go backend's login cookie over HTTP; the sealed value is what it sets after GitHub.
const cookieName = 'typle-session'
const login = (sub: string, name: string) => {
  const iat = Math.floor(Date.now() / 1000)
  return sealSession(secret, { sub, name, image: '', iat, exp: iat + 3600 })
}
let accountId = ''
test.beforeEach(async ({ context }) => {
  accountId = 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()
  await context.addCookies([{ name: cookieName, value: login(accountId, 'E2E User'), url: origin, httpOnly: true, sameSite: 'Lax' }])
})
test.afterEach(async () => {
  // Test users are isolated; cleanup is handled through a direct DB connection below.
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try { await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId]) } finally { await pool.end() }
})
async function seed(page: import('@playwright/test').Page, lists: unknown[]) {
  const response = await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { accountId, revision: 0, lists } })
  expect(response.status()).toBe(200)
}

test('user menu signs out and returns to home', async ({ page }) => {
  await page.goto('/home')
  const menu = page.getByRole('button', { name: 'アカウントメニュー', exact: true })
  await expect(menu).toBeVisible()
  await expect(page.getByRole('button', { name: /Logout|ログアウト/ })).toHaveCount(0)
  await menu.click()
  await expect(page.getByRole('menu')).toContainText('E2E User')
  await expect(page.getByRole('menuitem', { name: '端末を管理' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'ログアウト', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.press('Enter')
  await page.getByRole('menuitem', { name: 'ログアウト', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()
})

test('a failed sign-out keeps the user signed in and says so', async ({ page }) => {
  await page.route('**/api/auth/signout', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"databaseUnavailable"}' }))
  await page.goto('/home')
  await page.getByRole('button', { name: 'アカウントメニュー', exact: true }).click()
  await page.getByRole('menuitem', { name: 'ログアウト', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'ログアウトできませんでした' })).toBeVisible()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: 'アカウントメニュー', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toHaveCount(0)
})

test('real API rejects anonymous, cross-origin, account spoofing and stale writes', async ({ page, context }) => {
  await seed(page, [{ id: 'private', name: 'Private', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  const base = { accountId, revision: 1, lists: [] }
  expect((await page.request.put('/api/workspace', { headers: { Origin: 'https://attacker.invalid' }, data: base })).status()).toBe(403)
  expect((await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { ...base, accountId: 'github:2' } })).status()).toBe(401)
  expect((await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { ...base, revision: 0 } })).status()).toBe(409)
  const originalCookies = await context.cookies()
  await context.addCookies([{ name: cookieName, value: login(accountId + '1', 'Other'), url: origin }])
  expect((await (await page.request.get('/api/workspace')).json()).lists).toEqual([])
  await context.clearCookies()
  expect((await page.request.get('/api/workspace')).status()).toBe(401)
  expect((await page.request.put('/api/workspace', { headers: { Origin: origin }, data: base })).status()).toBe(401)
  await page.goto('/edit')
  await expect(page.getByRole('heading', { level: 1, name: '単語リスト', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Private を編集', exact: true })).toHaveCount(0)
  await context.addCookies(originalCookies)
  expect((await (await page.request.get('/api/workspace')).json()).lists[0].name).toBe('Private')
})

test('legacy data migrates once to the authenticated database account', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('typle-r:word-lists:v1', JSON.stringify({ version: 1, lists: [{ id: 'old', name: 'Legacy', createdAt: '2026-09-06', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }] })))
  await page.goto('/home')
  const button = page.getByRole('button', { name: 'このアカウントへ移行する' })
  await button.click()
  await expect(page.getByRole('status')).toContainText('移行しました。')
  await button.click()
  await expect(page.getByRole('status')).toContainText('移行しました。')
  await page.reload()
  expect((await (await page.request.get('/api/workspace')).json()).lists).toHaveLength(1)
  expect(await page.evaluate(() => localStorage.getItem('typle-r:word-lists:v1'))).toContain('Legacy')
})

test('switching account refreshes the workspace without exposing the previous list', async ({ page, context }) => {
  await seed(page, [{ id: 'private-switch', name: 'Previous account list', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  await page.goto('/edit')
  await expect(page.getByRole('button', { name: 'Previous account list を編集', exact: true })).toBeVisible()
  await context.addCookies([{ name: cookieName, value: login(accountId + '1', 'Other account'), url: origin }])
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('button', { name: 'アカウントメニュー', exact: true })).toHaveAttribute('title', 'Other account')
  await expect(page.getByRole('button', { name: 'Previous account list を編集', exact: true })).toHaveCount(0)
})

// A session check that fails (the backend is unreachable, as on waking from sleep before the network is back) is not
// an answer: the user stays signed in and the lists stay the cloud ones, instead of switching to the guest workspace.
test('a failed session check keeps the signed-in user and the cloud lists', async ({ page }) => {
  await seed(page, [{ id: 'cloud-keep', name: 'Cloud list', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  await page.goto('/edit')
  const menu = page.getByRole('button', { name: 'アカウントメニュー', exact: true })
  const list = page.getByRole('button', { name: 'Cloud list を編集', exact: true })
  await expect(menu).toBeVisible()
  await expect(list).toBeVisible()
  const failures: [string, (route: import('@playwright/test').Route) => Promise<void>][] = [
    ['503', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"databaseUnavailable"}' })],
    ['network error', route => route.abort()],
    ['not JSON', route => route.fulfill({ status: 200, contentType: 'application/json', body: '<html>' })],
  ]
  for (const [name, fail] of failures) {
    await page.route('**/api/auth/session', fail)
    for (const trigger of ['visibilitychange', 'focus']) {
      const checked = page.waitForRequest('**/api/auth/session')
      await page.evaluate(event => event === 'focus' ? window.dispatchEvent(new Event('focus')) : document.dispatchEvent(new Event(event)), trigger)
      await checked
      // Give the failed answer time to be applied, were it taken for a sign-out.
      await page.waitForTimeout(500)
      await expect(menu, `${name} on ${trigger}`).toBeVisible()
      await expect(list, `${name} on ${trigger}`).toBeVisible()
      await expect(page.getByRole('button', { name: 'GitHubでログイン' }), `${name} on ${trigger}`).toHaveCount(0)
    }
    await page.unroute('**/api/auth/session', fail)
  }
})

test('the first session check is tried again until it answers', async ({ page }) => {
  let calls = 0
  await page.route('**/api/auth/session', route => ++calls <= 2
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"authUnavailable"}' })
    : route.continue())
  await page.goto('/home')
  await expect(page.getByRole('button', { name: 'アカウントメニュー', exact: true })).toBeVisible()
  expect(calls).toBeGreaterThanOrEqual(3)
})

test('a session check that keeps failing settles on signed out', async ({ page }) => {
  let calls = 0
  await page.route('**/api/auth/session', route => { calls++; return route.abort() })
  await page.goto('/home')
  await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()
  expect(calls).toBe(4)
})
