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
