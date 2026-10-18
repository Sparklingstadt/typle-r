import { test, expect, type Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { randomBytes } from 'node:crypto'
const origin = 'http://127.0.0.1:3101'
const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
const key = 'typle-r:guest-workspace:v1'
const uuid = /\/shared\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
let accountId = ''

test.afterEach(async () => {
  if (!accountId) return
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await pool.query('DELETE FROM typle_shared_lists WHERE owner_id = $1', [accountId])
    await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId])
  } finally { await pool.end() }
  accountId = ''
})

const row = (page: Page, name: string) => page.locator('li[data-list-id]').filter({ has: page.getByRole('heading', { name, exact: true }) })

async function openShare(page: Page, name: string) {
  await page.getByRole('button', { name: `${name} のその他の操作`, exact: true }).click()
  await page.getByRole('menuitem', { name: '共有…', exact: true }).click()
  return page.getByRole('dialog', { name: `「${name}」を共有` })
}

test('a shared list can be opened and copied without login, and unsharing hides it', async ({ browser, context, page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  accountId = 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()
  const token = await encode({ token: { sub: accountId, name: 'E2E User' }, secret, salt: 'authjs.session-token' })
  await context.addCookies([{ name: 'authjs.session-token', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }])

  // The owner turns sharing on and gets a link with an id issued by the server.
  await page.goto('/edit')
  let dialog = await openShare(page, 'Test 1')
  const toggle = dialog.getByRole('switch', { name: 'リンクを知っている人に公開', exact: true })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  const link = dialog.getByRole('textbox', { name: '共有リンク', exact: true })
  await expect(link).toHaveValue(uuid)
  const url = await link.inputValue()
  const shareId = url.split('/').pop()!
  await expect(dialog).toContainText('練習記録は公開されません。')
  await page.keyboard.press('Escape')
  await expect(row(page, 'Test 1')).toContainText('共有中')

  // The public API shows only the name, words and update time.
  const api = await page.request.get(`/api/shared/${shareId}`)
  expect(api.status()).toBe(200)
  expect(api.headers()['cache-control']).toBe('no-store')
  expect(Object.keys(await api.json()).sort()).toEqual(['name', 'updatedAt', 'words'])
  expect((await page.request.get('/api/shared/not-a-uuid')).status()).toBe(404)
  expect((await page.request.get('/api/shared/11111111-2222-4333-8444-555555555555')).status()).toBe(404)

  // A reader without login sees the list and copies it into this browser.
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  guest.on('pageerror', error => errors.push(error.message))
  await guest.goto(url)
  await expect(guest.getByRole('heading', { level: 1, name: 'Test 1', exact: true })).toBeVisible()
  await expect(guest.getByRole('main').getByText('このブラウザーに保存')).toBeVisible()
  await guest.getByRole('button', { name: '自分のリストにコピー', exact: true }).click()
  await expect(guest).toHaveURL(/\/edit\?list=/)
  const copyId = decodeURIComponent(new URL(guest.url()).searchParams.get('list')!)
  // The guest's own samples include a Test 1, so the copy gets the next free name.
  await expect(guest.getByText('「Test 1（コピー）」を追加しました')).toBeVisible()
  const saved = await guest.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null').lists, key)
  const copy = saved.find((list: { id: string }) => list.id === copyId)
  expect(copy).toMatchObject({ name: 'Test 1（コピー）', records: [] })
  expect(copy.words.length).toBeGreaterThan(0)
  expect('shared' in copy).toBe(false)
  await guest.goto(`/play?list=${encodeURIComponent(copyId)}`)
  await expect(guest.getByRole('main')).toContainText('Test 1（コピー）')

  // Copying again adds another, separate list.
  await guest.goto(url)
  await guest.getByRole('button', { name: '自分のリストにコピー', exact: true }).click()
  await expect(guest.getByText('「Test 1（コピー2）」を追加しました')).toBeVisible()

  // When the owner turns sharing off, the link stops working.
  dialog = await openShare(page, 'Test 1')
  await dialog.getByRole('switch', { name: 'リンクを知っている人に公開', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: '共有リンク', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(row(page, 'Test 1')).not.toContainText('共有中')
  await guest.goto(url)
  await expect(guest.getByText('このリストは共有されていないか、削除されました。')).toBeVisible()
  await guestContext.close()
  expect(errors).toEqual([])
})

test('guests cannot share', async ({ page }) => {
  await page.goto('/edit')
  await page.getByRole('button', { name: 'Test 1 のその他の操作', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '共有…', exact: true })).toBeDisabled()
  await expect(page.getByRole('menu')).toContainText('ログインすると共有できます')
})

test('copying waits until the reader’s own lists have loaded', async ({ context, page }) => {
  accountId = 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()
  const token = await encode({ token: { sub: accountId, name: 'E2E Reader' }, secret, salt: 'authjs.session-token' })
  await context.addCookies([{ name: 'authjs.session-token', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }])
  const shareId = crypto.randomUUID()
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await pool.query(`INSERT INTO typle_shared_lists (share_id, owner_id, list_id, name, words) VALUES ($1, $2, 'l', 'Slow', $3)`,
      [shareId, accountId, JSON.stringify([{ display: 'a', input: 'a', annotation: '' }])])
  } finally { await pool.end() }
  // Hold the reader's workspace back until the shared list is on screen.
  let release = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/workspace*', async route => { if (route.request().method() === 'GET') await held; await route.continue() })
  await page.goto(`/shared/${shareId}`)
  const copy = page.getByRole('button', { name: '自分のリストにコピー', exact: true })
  await expect(page.getByRole('heading', { level: 1, name: 'Slow', exact: true })).toBeVisible()
  await expect(copy).toBeDisabled()
  release()
  await expect(copy).toBeEnabled()
  await copy.click()
  await expect(page).toHaveURL(/\/edit\?list=/)
})
