import { test, expect } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { randomBytes } from 'node:crypto'
const origin = 'http://127.0.0.1:3101'
const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
let accountId = ''
test.beforeEach(async ({ context }) => {
  accountId = 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()
  const token = await encode({ token: { sub: accountId, name: 'E2E User' }, secret, salt: 'authjs.session-token' })
  await context.addCookies([{ name: 'authjs.session-token', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }])
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
  const menu = page.getByRole('button', { name: 'User menu', exact: true })
  await expect(menu).toBeVisible()
  await expect(page.getByRole('button', { name: /Logout|ログアウト/ })).toHaveCount(0)
  await menu.click()
  await expect(page.getByRole('menuitem', { name: 'Manage devices' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Logout', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.press('Enter')
  await page.getByRole('menuitem', { name: 'Logout', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()
})


test('create, reorder, edit, play, reload and delete records', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/create')
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('E2E Practice')
  await page.getByRole('textbox', { name: '表示する単語 1', exact: true }).fill('First')
  await page.getByRole('button', { name: '入力', exact: true }).nth(0).click()
  await page.getByRole('textbox', { name: '入力する文字 1', exact: true }).fill('a')
  await page.getByRole('button', { name: '単語を追加', exact: true }).click()
  await page.getByRole('textbox', { name: '表示する単語 2', exact: true }).fill('Second')
  await page.getByRole('button', { name: '入力', exact: true }).nth(1).click()
  await page.getByRole('textbox', { name: '入力する文字 2', exact: true }).fill('b')
  await page.getByRole('button', { name: '単語 2 を上へ', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('b')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.reload()
  await page.getByRole('button', { name: 'E2E Practice を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Saved Practice')
  await page.getByRole('button', { name: '入力', exact: true }).nth(0).click()
  await page.getByRole('textbox', { name: '入力する文字 1', exact: true }).fill('c')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: 'Saved Practice を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Not saved')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved Practice を編集', exact: true })).toBeVisible()
  await page.goto('/play')
  await page.getByRole('button', { name: 'Saved Practice を選択', exact: true }).click()
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('x')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await input.press('Backspace')
  await input.pressSequentially('c')
  await expect(input).toHaveValue('')
  await expect(page.getByRole('status')).toHaveText('2 / 2 単語')
  await input.pressSequentially('a')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  await expect(page.getByRole('table', { name: '練習結果の詳細', exact: true }).getByRole('row').filter({ hasText: 'ミス数' })).toContainText('1 文字')
  await expect(page.getByRole('table', { name: '練習結果の詳細', exact: true }).getByRole('row').filter({ hasText: '正確率' })).toContainText('66.67%')
  await page.getByRole('button', { name: 'Saved Practice を選択中', exact: true }).click()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await page.goto('/records')
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'Saved Practice' })).toHaveCount(1)
  await page.getByRole('button', { name: /Saved Practice.*記録を削除/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Saved Practice' })).toHaveCount(1)
  await page.getByRole('button', { name: /Saved Practice.*記録を削除/ }).click()
  let failDelete = true
  await page.route('**/api/workspace', async route => {
    if (route.request().method() === 'PUT' && failDelete) {
      failDelete = false
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '一時的な保存エラー' }) })
    } else await route.continue()
  })
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('削除できませんでした')
  await page.screenshot({ path: 'test-results/shadcn-delete-dialog.png' })
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByText('まだ記録がありません。', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByText('まだ記録がありません。', { exact: false })).toBeVisible()
  await page.goto('/edit')
  await page.getByRole('button', { name: 'Saved Practice を削除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved Practice を編集', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Saved Practice を編集', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('damaged storage is not overwritten', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('typle-r:word-lists:v1', '{broken'))
  await page.goto('/home')
  await page.getByRole('button', { name: 'このアカウントへ移行する' }).click()
  await expect(page.getByRole('status').filter({ hasText: '保存データを読み込めません' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('typle-r:word-lists:v1'))).toBe('{broken')
})

test('supporting pages, root redirect and GitHub link', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/Sparklingstadt/typle-r')
  for (const [path, title] of [['/guide', '使い方'], ['/about', 'Typleについて'], ['/rankings', '自分のベスト記録']]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
})

test('IME commits advance once even with a duplicate input event', async ({ page }) => {
  await seed(page, [{
    id: 'ime', name: 'IME', createdAt: '2026-09-06', records: [],
    words: [{ display: 'あ', input: 'あ', annotation: '' }, { display: 'あ', input: 'あ', annotation: '' }],
  }])
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.dispatchEvent('compositionstart')
  await input.fill('あ')
  await expect(page.getByRole('status')).toHaveText('1 / 2 単語')
  await input.dispatchEvent('compositionend', { data: 'あ' })
  await expect(page.getByRole('status')).toHaveText('2 / 2 単語')
  await input.fill('あ')
  await expect(page.getByRole('status')).toHaveText('2 / 2 単語')
  await input.dispatchEvent('compositionstart')
  await input.fill('あ')
  await input.dispatchEvent('compositionend', { data: 'あ' })
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
})

test('failed record storage preserves result and can be retried', async ({ page }) => {
  await seed(page, [{ id: 'retry', name: 'Retry', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  let failed = false
  await page.route('**/api/workspace', async route => {
    if (route.request().method() === 'PUT' && !failed) {
      failed = true
      await route.fulfill({ status: 503, json: { error: '保存できませんでした。' } })
    } else await route.continue()
  })
  await page.goto('/play')
  await page.getByRole('textbox', { name: '表示された文字を入力', exact: true }).pressSequentially('a')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('記録はまだ保存されていません。')
  await page.getByRole('button', { name: '記録の保存を再試行' }).click()
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  expect((await (await page.request.get('/api/workspace')).json()).lists[0].records.length).toBe(1)
})


test('real API rejects anonymous, cross-origin, account spoofing and stale writes', async ({ page, context }) => {
  await seed(page, [{ id: 'private', name: 'Private', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  const base = { accountId, revision: 1, lists: [] }
  expect((await page.request.put('/api/workspace', { headers: { Origin: 'https://attacker.invalid' }, data: base })).status()).toBe(403)
  expect((await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { ...base, accountId: 'github:2' } })).status()).toBe(401)
  expect((await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { ...base, revision: 0 } })).status()).toBe(409)
  const originalCookies = await context.cookies()
  const token = await encode({ token: { sub: accountId + '1', name: 'Other' }, secret, salt: 'authjs.session-token' })
  await context.addCookies([{ name: 'authjs.session-token', value: token, url: origin }])
  expect((await (await page.request.get('/api/workspace')).json()).lists).toEqual([])
  await context.clearCookies()
  expect((await page.request.get('/api/workspace')).status()).toBe(401)
  expect((await page.request.put('/api/workspace', { headers: { Origin: origin }, data: base })).status()).toBe(401)
  await page.goto('/edit')
  await expect(page.getByRole('button', { name: 'GitHubでログインして続ける' })).toBeVisible()
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

test('Tailwind editor remains accessible and fits mobile and desktop', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/create')
    const name = page.getByRole('textbox', { name: '単語リスト名', exact: true })
    await expect(name).toBeVisible()
    await expect(name).toHaveAttribute('required', '')
    await expect(page.getByRole('button', { name: '単語 1 を上へ', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(name).toBeFocused()
    await name.fill('Keyboard test')
    await name.press('Tab')
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '作成', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.screenshot({ path: `test-results/tailwind-editor-${width}.png`, fullPage: true })
  }
})

test('switching account refreshes the workspace without exposing the previous list', async ({ page, context }) => {
  await seed(page, [{ id: 'private-switch', name: 'Previous account list', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  await page.goto('/edit')
  await expect(page.getByRole('button', { name: 'Previous account list を編集', exact: true })).toBeVisible()
  const token = await encode({ token: { sub: accountId + '1', name: 'Other account' }, secret, salt: 'authjs.session-token' })
  await context.addCookies([{ name: 'authjs.session-token', value: token, url: origin }])
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('img', { name: 'Other account', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous account list を編集', exact: true })).toHaveCount(0)
})

test('wordDisplay compares each displayed character and clears colors after correction', async ({ page }) => {
  await seed(page, [{ id: 'colors', name: 'Colors', createdAt: '2026-09-06', records: [], words: [{ display: 'hoge', input: 'hoge', annotation: '' }] }])
  await page.goto('/play')
  const characters = page.locator('#wordDisplay span')
  const input = page.getByRole('textbox', { name: '表示された文字を入力' })
  await expect(page.locator('#wordDisplay')).toHaveText('hoge')
  await expect(page.getByRole('heading', { name: 'タイピング練習', exact: true })).toHaveCount(0)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const card = await page.locator('main > [data-slot="card"]').boundingBox()
    const display = await page.locator('#wordDisplay').boundingBox()
    expect(Math.abs(display!.x - card!.x)).toBeLessThan(1)
    expect(Math.abs(display!.width - card!.width)).toBeLessThan(1)
  }

  await expect(page.getByLabel('入力する文字', { exact: true })).toHaveCount(0)
  await input.fill('hx')
  await expect(characters.nth(0)).toHaveClass(/text-green-400/)
  await expect(characters.nth(1)).toHaveClass(/text-red-400/)
  await expect(characters.nth(2)).toHaveAttribute('class', '')
  await input.fill('ho')
  await expect(characters.nth(1)).toHaveClass(/text-green-400/)
  await input.fill('')
  await expect(characters.nth(0)).toHaveAttribute('class', '')
})

test('optional word fields preserve overrides and annotations after saving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/create')
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Defaults')
  const display = page.getByRole('textbox', { name: '表示する単語 1', exact: true })
  await display.fill('hello')
  await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '入力', exact: true }).click()
  const input = page.getByRole('textbox', { name: '入力する文字 1', exact: true })
  await expect(input).toHaveValue('hello')
  await display.fill('world')
  await expect(input).toHaveValue('world')
  await input.fill('custom')
  await display.fill('表示')
  await expect(input).toHaveValue('custom')
  await page.getByRole('button', { name: '補足', exact: true }).click()
  await page.getByRole('textbox', { name: '補足 1', exact: true }).fill('ヒント')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '入力', exact: true }).click()
  await page.getByRole('button', { name: '補足', exact: true }).click()
  await page.getByRole('button', { name: '単語を追加', exact: true }).click()
  await page.getByRole('textbox', { name: '表示する単語 2', exact: true }).fill('default')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.reload()
  const workspace = await (await page.request.get('/api/workspace')).json()
  expect(workspace.lists.find((list: { name: string }) => list.name === 'Defaults').words).toEqual([
    { display: '表示', input: 'custom', annotation: 'ヒント' },
    { display: 'default', input: 'default', annotation: '' },
  ])
  await page.getByRole('button', { name: 'Defaults を編集', exact: true }).click()
  await page.getByRole('button', { name: '入力', exact: true }).first().click()
  await expect(input).toHaveValue('custom')
  await page.getByRole('button', { name: '補足', exact: true }).first().click()
  await expect(page.getByRole('textbox', { name: '補足 1', exact: true })).toHaveValue('ヒント')
})

test('mobile sidebar opens, closes after navigation and keeps desktop navigation available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/home')
  await expect(page.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'メニューを開く' }).click()
  await expect(page.getByRole('button', { name: 'メニューを閉じる' })).toHaveAttribute('aria-expanded', 'true')
  const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' })
  await navigation.getByRole('link', { name: '作成', exact: true }).click()
  await expect(page).toHaveURL(/\/create$/)
  await expect(page.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute('aria-expanded', 'false')
  await expect(navigation.getByRole('link', { name: '作成', exact: true })).toHaveAttribute('aria-current', 'page')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('button', { name: 'メニューを開く' })).toBeHidden()
  await expect(navigation.getByRole('link', { name: '編集', exact: true })).toBeVisible()
})

test('best five records sort by accuracy then time and refresh after practice', async ({ page }) => {
  await seed(page, [
    { id: 'best', name: 'Best', createdAt: '2026-09-06', words: [{ display: 'a', input: 'a', annotation: 'ヒント' }, { display: 'b', input: 'b', annotation: '' }],
      records: [9, 3, 8, 5, 7, 1].map((time, index) => ({ id: `record-${index}`, time, date: '2026-09-06', accuracy: time === 1 ? 50 : 100, wordCount: 2 })) },
    { id: 'empty', name: 'Empty', createdAt: '2026-09-06', records: [], words: [{ display: 'x', input: 'x', annotation: '' }] },
  ])
  await page.goto('/play')
  const table = page.getByRole('table', { name: 'ベスト記録 上位5件', exact: true })
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(table.locator('tbody tr td:first-of-type')).toHaveText(['3.00 秒', '5.00 秒', '7.00 秒', '8.00 秒', '9.00 秒'])
  await expect(page.getByText('ヒント', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Empty を選択', exact: true }).click()
  await expect(table).toContainText('まだ記録がありません。')
  await page.getByRole('button', { name: 'Best を選択', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Best を選択中', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('a')
  await expect(page.getByLabel('単語の進捗').locator('span').first()).toHaveClass(/green/)
  await input.pressSequentially('b')
  await expect(page.getByRole('heading', { name: '練習完了：Best', exact: true })).toBeVisible()
  await expect(page.getByLabel('単語の進捗')).toHaveCount(0)
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(table).not.toContainText('9.00 秒')
  await page.reload()
  await expect(table).not.toContainText('9.00 秒')
  await page.goto('/rankings')
  await expect(page.getByRole('table', { name: 'Best のベスト記録', exact: true }).locator('tbody tr')).toHaveCount(5)
})

test('save and delete notifications stack and animate before being dismissed', async ({ page }) => {
  await seed(page, [{ id: 'toast', name: 'Toast', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  await page.goto('/edit')
  await page.getByRole('button', { name: 'Toast を編集', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const notifications = page.getByLabel('通知', { exact: true })
  const updated = notifications.getByRole('status').filter({ hasText: '更新しました' })
  await expect(updated).toBeVisible()
  await updated.hover()
  await page.getByRole('button', { name: 'Toast を削除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(notifications.getByRole('status')).toHaveCount(2)
  const deleted = notifications.getByRole('status').filter({ hasText: '削除しました' })
  await expect(deleted).toBeVisible()
  await updated.getByRole('button', { name: '通知を閉じる' }).click()
  await expect(updated).toHaveClass(/animate-out/)
  await expect(updated).toHaveCount(0)
  await expect(deleted).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(deleted).toHaveCount(0, { timeout: 8000 })
})

for (const format of ['csv', 'tsv'] as const) {
  test(`${format} import validates, previews, appends and persists words`, async ({ page }) => {
    await seed(page, [])
    await page.goto('/create')
    const file = page.getByLabel('CSV・TSVファイルから追加', { exact: true })
    await file.setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('input,display\na,') })
    await expect(page.getByRole('region', { name: 'ファイルから単語を追加' }).getByRole('alert')).toContainText('input と display は必須')
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue('')
    const text = format === 'csv' ? 'input,display,annotation\r\nJapan,"日本,Japan","国名 ""country"""' : 'input\tdisplay\nJapan\t日本'
    await file.setInputFiles({ name: `Imported.${format}`, mimeType: 'text/plain', buffer: Buffer.from(text) })
    await expect(page.getByRole('region', { name: 'ファイルから単語を追加' }).getByRole('status')).toContainText('1件を追加しました')
    await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('Imported')
    await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('Japan')
    await file.setInputFiles({ name: 'more.tsv', mimeType: 'text/plain', buffer: Buffer.from('display\tinput\nフランス\tFrance') })
    await expect(page.getByRole('textbox', { name: '入力する文字 2', exact: true })).toHaveValue('France')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/edit$/)
    await page.reload()
    await page.getByRole('button', { name: 'Imported を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue(format === 'csv' ? '日本,Japan' : '日本')
    await expect(page.getByRole('textbox', { name: '表示する単語 2', exact: true })).toHaveValue('フランス')
    await page.getByRole('button', { name: '入力', exact: true }).first().click()
    await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('Japan')
    await page.getByRole('button', { name: '補足', exact: true }).first().click()
    await expect(page.getByRole('textbox', { name: '補足 1', exact: true })).toHaveValue(format === 'csv' ? '国名 "country"' : '')
  })
}

for (const theme of ['light', 'dark']) {
  test(`typing, annotations, editor and deletion dialog remain usable in ${theme} theme`, async ({ page }, testInfo) => {
    await seed(page, [{ id: 'theme', name: 'Theme practice', createdAt: '2026-09-27', records: [], words: [{ display: 'hello', input: 'hello', annotation: 'あいさつ' }] }])
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/play')
    await expect(page.getByRole('button', { name: 'ダークモード', exact: true })).toBeVisible()
    if (await page.getByRole('button', { name: 'ダークモード', exact: true }).getAttribute('aria-pressed') !== String(theme === 'dark')) {
      await page.getByRole('button', { name: 'ダークモード', exact: true }).click()
    }
    const display = page.locator('#wordDisplay')
    await expect(display).toHaveText('hello')
    const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
    await input.fill('hx')
    const colors = await page.evaluate(() => {
      const display = document.querySelector('#wordDisplay')!
      return {
        normal: getComputedStyle(display).color,
        correct: getComputedStyle(display.children[0]).color,
        incorrect: getComputedStyle(display.children[1]).color,
        annotation: getComputedStyle(display.previousElementSibling!).color,
      }
    })
    expect(colors.annotation).toBe(colors.normal)
    expect(colors.correct).not.toBe(colors.normal)
    expect(colors.incorrect).not.toBe(colors.correct)
    await page.screenshot({ path: testInfo.outputPath(`practice-${theme}.png`), fullPage: true })
    await input.fill('hello')
    await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
    await page.goto('/edit')
    await page.getByRole('button', { name: 'Theme practice を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('Theme practice')
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
    await page.getByRole('button', { name: 'Theme practice を削除', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`dialog-${theme}.png`), fullPage: true })
    await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click()
    await expect(page.getByRole('button', { name: 'ダークモード', exact: true })).toHaveAttribute('aria-pressed', String(theme === 'dark'))
  })
}

test('devices persist, are locked during practice, and survive rename and deletion in history', async ({ page }) => {
  await seed(page, [{ id: 'devices', name: 'Devices practice', createdAt: '2026-09-27', records: [{ time: 5, date: '2026-09-01' }], words: [{ display: 'ab', input: 'ab', annotation: '' }] }])
  await page.goto('/devices')
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '端末', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByLabel('端末名', { exact: true }).fill('MacBook')
  await page.getByLabel('配列・メモ（任意）').fill('JIS')
  await page.getByRole('button', { name: '端末を保存', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'MacBook', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'MacBook', exact: true })).toBeVisible()
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/devices-${width}.png`, fullPage: true })
  }
  const workspace = await (await page.request.get('/api/workspace')).json()
  const device = workspace.devices[0]
  await page.goto('/play')
  await page.getByLabel('使用端末', { exact: true }).selectOption(device.id)
  await page.reload()
  await expect(page.getByLabel('使用端末', { exact: true })).toHaveValue(device.id)
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('a')
  await expect(page.getByLabel('使用端末', { exact: true })).toBeDisabled()
  // Another screen changes the registered name while this practice is underway.
  expect((await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { ...workspace, devices: [{ ...device, name: 'Changed elsewhere' }] } })).status()).toBe(200)
  await input.pressSequentially('b')
  await expect(page.getByText('別の画面で更新されています。最新データを読み込んでから再試行してください。')).toBeVisible()
  await page.getByRole('button', { name: '記録の保存を再試行' }).click()
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  await expect(page.getByRole('table', { name: '練習結果の詳細', exact: true })).toContainText('MacBook（JIS）')
  await page.goto('/devices')
  await page.getByRole('button', { name: 'Changed elsewhere を編集', exact: true }).click()
  await page.getByLabel('端末名', { exact: true }).fill('Renamed')
  await page.getByRole('button', { name: '端末を保存', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Renamed', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Renamed を削除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByText('端末はまだ登録されていません。')).toBeVisible()
  await page.goto('/records')
  await page.reload()
  await expect(page.getByRole('cell', { name: 'MacBook（JIS）', exact: true })).toHaveCount(1)
  await expect(page.getByRole('cell', { name: '未記録', exact: true })).toHaveCount(1)
  await page.goto('/rankings')
  await expect(page.getByRole('cell', { name: 'MacBook（JIS）', exact: true })).toBeVisible()
  await page.goto('/play')
  await expect(page.getByLabel('使用端末', { exact: true })).toHaveValue('')
})

test('CSV import preserves existing records and exact strings after a failed save and retry', async ({ page }) => {
  const existing = { id: 'csv-existing', name: 'Existing', createdAt: '2026-09-27', words: [{ display: 'Old', input: 'old', annotation: '' }], records: [{ date: '2026-09-27', time: 1 }] }
  await seed(page, [existing])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/create')
  await page.getByLabel('CSV・TSVファイルから追加', { exact: true }).setInputFiles({ name: 'words.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeffdisplay,input,annotation\r\n" 字 ",zi,"意味,補足\r\n""引用"""\r\n字,zi,\r\n字,zi,') })
  await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue(' 字 ')
  expect((await (await page.request.get('/api/workspace')).json()).lists).toEqual([existing])
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Existing')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '同じ名前' })).toBeVisible()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('CSV Chinese')
  let fail = true
  await page.route('**/api/workspace', async route => {
    if (route.request().method() === 'PUT' && fail) {
      fail = false
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '一時的な保存エラー' }) })
    } else await route.continue()
  })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '一時的な保存エラー' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('CSV Chinese')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'CSV Chinese を編集', exact: true })).toBeVisible()
  const saved = (await (await page.request.get('/api/workspace')).json()).lists
  expect(saved).toHaveLength(2)
  expect(saved[0]).toEqual(existing)
  expect(saved[1].words).toEqual([
    { display: ' 字 ', input: 'zi', annotation: '意味,補足\r\n"引用"' },
    { display: '字', input: 'zi', annotation: '' },
    { display: '字', input: 'zi', annotation: '' },
  ])
  expect(saved[1].records).toEqual([])
})

for (const width of [390, 1440]) {
  test(`word list CSV download and reimport preserve saved words at ${width}px`, async ({ page }, testInfo) => {
    const words = [
      { input: ' zi ', display: ' 字,日本 ', annotation: '意味\r\n"引用"' },
      { input: 'zi', display: '字', annotation: '' },
      { input: 'zi', display: '字', annotation: '' },
    ]
    const list = { id: 'export', name: '中国語', createdAt: '2026-09-27', words, records: [{ date: '2026-09-27', time: 1 }] }
    await seed(page, [list])
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/edit')
    const before = await (await page.request.get('/api/workspace')).json()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '中国語 をCSVエクスポート', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('中国語.csv')
    expect(await download.failure()).toBeNull()
    const path = testInfo.outputPath(download.suggestedFilename())
    await download.saveAs(path)
    expect(await (await page.request.get('/api/workspace')).json()).toEqual(before)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('export.png'), fullPage: true })
    await page.goto('/create')
    await page.getByLabel('CSV・TSVファイルから追加', { exact: true }).setInputFiles(path)
    await expect(page.getByRole('region', { name: 'ファイルから単語を追加' }).getByRole('status')).toContainText('3件を追加しました')
    await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('再取り込み')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/edit$/)
    const saved = (await (await page.request.get('/api/workspace')).json()).lists
    expect(saved[0]).toEqual(list)
    expect(saved[1].words).toEqual(words)
    expect(saved[1].records).toEqual([])
  })
}
