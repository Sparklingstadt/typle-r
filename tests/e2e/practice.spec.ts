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
async function importWords(page: import('@playwright/test').Page, files: Parameters<import('@playwright/test').Locator['setInputFiles']>[0]) {
  await page.getByRole('button', { name: 'CSV・TSVを読み込む', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'CSV・TSVから読み込む' })
  await dialog.getByLabel('CSV・TSVファイルを選択', { exact: true }).setInputFiles(files)
  await dialog.getByRole('button', { name: /語を追加$|語で置き換える$/ }).click()
  await expect(dialog).toHaveCount(0)
}
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
  await page.getByRole('textbox', { name: '入力する文字 1', exact: true }).fill('a')
  await page.getByRole('button', { name: '単語を追加', exact: true }).click()
  await page.getByRole('textbox', { name: '表示する単語 2', exact: true }).fill('Second')
  await page.getByRole('textbox', { name: '入力する文字 2', exact: true }).fill('b')
  await page.getByRole('button', { name: '単語 2 の操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '上へ移動', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('b')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.reload()
  await page.getByRole('button', { name: 'E2E Practice を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Saved Practice')
  await page.getByRole('textbox', { name: '入力する文字 1', exact: true }).fill('c')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: 'Saved Practice を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Not saved')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '破棄して戻る', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved Practice を編集', exact: true })).toBeVisible()
  await page.goto('/play')
  await page.getByRole('button', { name: 'Saved Practice を選択', exact: true }).click()
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('x')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await input.press('Backspace')
  await input.pressSequentially('c')
  await expect(input).toHaveValue('')
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuetext', '2 / 2 語')
  await input.pressSequentially('a')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('練習記録を保存しました。')
  await expect(result).toContainText('ミス 1 文字')
  await expect(result).toContainText('66.67%')
  await expect(result.getByRole('button', { name: /もう一度/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuetext', '1 / 2 語')
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
  const progress = page.getByRole('progressbar', { name: '単語の進捗' })
  await expect(progress).toHaveAttribute('aria-valuetext', '1 / 2 語')
  await input.dispatchEvent('compositionend', { data: 'あ' })
  await expect(progress).toHaveAttribute('aria-valuetext', '2 / 2 語')
  await input.fill('あ')
  await expect(progress).toHaveAttribute('aria-valuetext', '2 / 2 語')
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
  await expect(page.getByLabel('練習結果', { exact: true }).getByRole('alert')).toContainText('記録を保存できませんでした。')
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
  await expect(page.getByRole('heading', { name: '単語リストの編集', exact: true })).toBeVisible()
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

test('Tailwind editor remains accessible and fits mobile and desktop', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/create')
    const name = page.getByRole('textbox', { name: '単語リスト名', exact: true })
    await expect(name).toBeVisible()
    await expect(name).toHaveAttribute('required', '')
    await page.getByRole('button', { name: '単語 1 の操作', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '上へ移動', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(name).toBeFocused()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await name.fill('Keyboard test')
    await name.press('Enter')
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

test('target text is coloured from the first mismatch, guides differing input and ignores IME composition', async ({ page }) => {
  await seed(page, [{ id: 'colors', name: 'Colors', createdAt: '2026-09-06', records: [], words: [
    { display: 'hoge', input: 'hoge', annotation: '' },
    { display: '表示', input: 'custom', annotation: 'ヒント' },
  ] }])
  await page.goto('/play')
  const states = page.locator('#wordDisplay [data-state]')
  const input = page.getByRole('textbox', { name: '表示された文字を入力' })
  const feedback = page.locator('#practice-feedback')
  await expect(page.locator('#wordDisplay')).toHaveText('hoge')
  await expect(page.getByRole('heading', { name: 'タイピング練習', exact: true })).toHaveCount(0)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  const stateList = () => states.evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.state))
  await expect.poll(stateList).toEqual(['current', 'pending', 'pending', 'pending'])
  await input.fill('hx')
  await expect.poll(stateList).toEqual(['done', 'error', 'current-error', 'pending'])
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(feedback).toHaveText('2文字目から違います。Backspace で直してください。')
  // A later character that matches by position is still part of the mistake.
  await input.fill('hxge')
  await expect.poll(stateList).toEqual(['done', 'error', 'error', 'error'])
  await input.fill('ho')
  await expect.poll(stateList).toEqual(['done', 'done', 'current', 'pending'])
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await input.fill('hoge')

  // Display and input differ: the display stays plain and the input guide is coloured instead.
  await expect(page.locator('#wordDisplay')).toHaveText('表示')
  await expect(page.locator('#wordDisplay [data-state]')).toHaveCount(0)
  const guide = page.locator('p:has(> [data-state])')
  await expect(guide).toHaveText('custom')
  await expect(page.getByText('ヒント', { exact: true })).toBeVisible()
  await input.fill('cu')
  await expect(guide.locator('[data-state="done"]')).toHaveCount(2)
  // Uncommitted IME text is shown in the input but not judged.
  await input.dispatchEvent('compositionstart')
  await input.fill('cuずt')
  await expect(input).toHaveValue('cuずt')
  await expect(guide.locator('[data-state="error"]')).toHaveCount(0)
  await expect(feedback).toHaveText('変換中の文字は、確定してから判定します')
  await input.fill('cus')
  await input.dispatchEvent('compositionend', { data: 's' })
  await expect(guide.locator('[data-state="done"]')).toHaveCount(3)
})

test('optional word fields preserve overrides and annotations after saving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/create')
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Defaults')
  const display = page.getByRole('textbox', { name: '表示する単語 1', exact: true })
  await display.fill('hello')
  // An empty input uses the display; it is shown as a placeholder instead of a copied value.
  const input = page.getByRole('textbox', { name: '入力する文字 1', exact: true })
  await expect(input).toHaveValue('')
  await expect(input).toHaveAttribute('placeholder', 'hello')
  await display.fill('world')
  await expect(input).toHaveAttribute('placeholder', 'world')
  await input.fill('custom')
  await display.fill('表示')
  await expect(input).toHaveValue('custom')
  await page.getByRole('textbox', { name: '補足 1', exact: true }).fill('ヒント')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
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
  await expect(input).toHaveValue('custom')
  await expect(page.getByRole('textbox', { name: '補足 1', exact: true })).toHaveValue('ヒント')
  await expect(page.getByRole('textbox', { name: '入力する文字 2', exact: true })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: '入力する文字 2', exact: true })).toHaveAttribute('placeholder', 'default')
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
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuenow', '1')
  await page.getByRole('button', { name: 'すべての単語を表示' }).click()
  await expect(page.getByRole('list', { name: 'すべての単語' }).getByRole('listitem').first()).toContainText('（完了）')
  await input.pressSequentially('b')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('おつかれさまでした！')
  await expect(input).toHaveCount(0)
  await expect(result).toContainText('練習記録を保存しました。このリストの 1 位です。')
  await expect(result).toContainText('自己ベスト更新')
  await expect(table.getByRole('row').filter({ hasText: '今回の記録' })).toHaveCount(1)
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
    await page.getByRole('button', { name: 'CSV・TSVを読み込む', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'CSV・TSVから読み込む' })
    const file = dialog.getByLabel('CSV・TSVファイルを選択', { exact: true })
    await file.setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('input,display\na,') })
    await expect(dialog.getByRole('alert')).toContainText('input と display は必須')
    await expect(dialog.getByRole('button', { name: /語を追加$/ })).toHaveCount(0)
    const text = format === 'csv' ? 'input,display,annotation\r\nJapan,"日本,Japan","国名 ""country"""' : 'input\tdisplay\nJapan\t日本'
    await file.setInputFiles({ name: `Imported.${format}`, mimeType: 'text/plain', buffer: Buffer.from(text) })
    await expect(dialog.getByRole('table', { name: '読み込む単語のプレビュー' })).toContainText(format === 'csv' ? '日本,Japan' : '日本')
    await dialog.getByRole('button', { name: '1語を追加', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '1語を読み込みました' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('Imported')
    await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('Japan')
    await importWords(page, { name: 'more.tsv', mimeType: 'text/plain', buffer: Buffer.from('display\tinput\nフランス\tFrance') })
    await expect(page.getByRole('status').filter({ hasText: '1語を追加しました' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '入力する文字 2', exact: true })).toHaveValue('France')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/edit$/)
    await page.reload()
    await page.getByRole('button', { name: 'Imported を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue(format === 'csv' ? '日本,Japan' : '日本')
    await expect(page.getByRole('textbox', { name: '表示する単語 2', exact: true })).toHaveValue('フランス')
    await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('Japan')
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
  await expect(page.getByText('アカウントに保存', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '端末を追加', exact: true }).click()
  const addDialog = page.getByRole('dialog', { name: '端末を追加' })
  await addDialog.getByRole('textbox', { name: '端末名', exact: true }).fill('MacBook')
  await addDialog.getByRole('textbox', { name: '配列・メモ（任意）', exact: true }).fill('JIS')
  await expect(addDialog.getByRole('checkbox', { name: 'このブラウザーで練習に使う端末にする' })).toBeChecked()
  await addDialog.getByRole('button', { name: '追加する', exact: true }).click()
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
  // Adding the first device made it this browser's practice device.
  const deviceButton = page.getByRole('button', { name: '使用端末：MacBook（JIS）', exact: true })
  await expect(deviceButton).toBeEnabled()
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('a')
  await expect(deviceButton).toBeDisabled()
  // Another screen changes the registered name while this practice is underway.
  expect((await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { ...workspace, devices: [{ ...device, name: 'Changed elsewhere' }] } })).status()).toBe(200)
  await input.pressSequentially('b')
  await expect(page.getByText('別の画面で更新されています。最新データを読み込んでから再試行してください。')).toBeVisible()
  await page.getByRole('button', { name: '記録の保存を再試行' }).click()
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('MacBook（JIS）')
  await page.goto('/devices')
  const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Changed elsewhere', exact: true }) })
  await expect(row).toContainText('練習 1回 · 最終 今日')
  await row.getByRole('button', { name: 'Changed elsewhere を編集', exact: true }).click()
  const editDialog = page.getByRole('dialog', { name: '端末を編集' })
  await expect(editDialog).toContainText('これまでの練習記録（1回）には練習した時点の名前が残ります。')
  await editDialog.getByRole('textbox', { name: '端末名', exact: true }).fill('Renamed')
  await editDialog.getByRole('button', { name: '変更を保存', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Renamed', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Renamed を削除', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('この端末で練習した1回分の記録は削除されず')
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('heading', { name: '端末はまだ登録されていません', exact: true })).toBeVisible()
  await page.goto('/records')
  await page.reload()
  await expect(page.getByRole('cell', { name: 'MacBook（JIS）', exact: true })).toHaveCount(1)
  await expect(page.getByRole('cell', { name: '未記録', exact: true })).toHaveCount(1)
  await page.goto('/rankings')
  await expect(page.getByRole('cell', { name: 'MacBook（JIS）', exact: true })).toBeVisible()
  await page.goto('/play')
  await expect(page.getByRole('button', { name: '使用端末：未選択', exact: true })).toBeVisible()
})

test('CSV import preserves existing records and exact strings after a failed save and retry', async ({ page }) => {
  const existing = { id: 'csv-existing', name: 'Existing', createdAt: '2026-09-27', words: [{ display: 'Old', input: 'old', annotation: '' }], records: [{ date: '2026-09-27', time: 1 }] }
  await seed(page, [existing])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/create')
  await importWords(page, { name: 'words.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeffdisplay,input,annotation\r\n" 字 ",zi,"意味,補足\r\n""引用"""\r\n字,zi,\r\n字,zi,') })
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
    await importWords(page, path)
    await expect(page.getByRole('status').filter({ hasText: '3語を読み込みました' })).toBeVisible()
    await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('再取り込み')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/edit$/)
    const saved = (await (await page.request.get('/api/workspace')).json()).lists
    expect(saved[0]).toEqual(list)
    expect(saved[1].words).toEqual(words)
    expect(saved[1].records).toEqual([])
  })
}
