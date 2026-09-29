import { test, expect } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
async function importWords(page: import('@playwright/test').Page, files: Parameters<import('@playwright/test').Locator['setInputFiles']>[0]) {
  await page.getByRole('button', { name: 'CSV・TSVを読み込む', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'CSV・TSVから読み込む' })
  await dialog.getByLabel('CSV・TSVファイルを選択', { exact: true }).setInputFiles(files)
  await dialog.getByRole('button', { name: /語を追加$|語で置き換える$/ }).click()
  await expect(dialog).toHaveCount(0)
}

async function addDevice(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: '端末を追加', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '端末を追加' })
  await dialog.getByRole('textbox', { name: '端末名', exact: true }).fill(name)
  await dialog.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

test('guest can create, import, export, edit, practice, manage devices and delete without cloud persistence', async ({ page }) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', request => { if (request.url().includes('/api/workspace')) requests.push(request.method()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/create')
  await importWords(page, { name: 'Guest.csv', mimeType: 'text/csv', buffer: Buffer.from('input,display,annotation\na,First,one\nb,Second,two') })
  await page.getByRole('button', { name: '単語 2 の操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '上へ移動', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.reload()
  await page.getByRole('button', { name: 'Guest を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Guest saved')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guest saved のその他の操作', exact: true }).click()
  await page.getByRole('menuitem', { name: 'CSVエクスポート', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('Guest saved.csv')
  await page.goto('/devices')
  await addDevice(page, 'Guest Mac')
  await expect(page.getByRole('heading', { name: 'Guest Mac', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Guest Mac', exact: true })).toBeVisible()
  await page.goto('/play')
  await page.getByRole('button', { name: 'Guest saved を選択', exact: true }).click()
  // The first device added becomes the one this browser practises with.
  await expect(page.getByRole('button', { name: '使用端末：Guest Mac', exact: true })).toBeEnabled()
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await expect(input).toBeFocused()
  await input.pressSequentially('b')
  await input.pressSequentially('a')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  await page.goto('/rankings')
  await expect(page.getByRole('table', { name: 'Guest saved の上位の記録', exact: true })).toContainText('Guest Mac')
  await page.goto('/records')
  await page.reload()
  await expect(page.getByRole('listitem').filter({ hasText: 'Guest saved' })).toContainText('Guest Mac')
  await page.getByRole('button', { name: /Guest saved.*記録を削除/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: 'Guest saved' })).toHaveCount(0)
  await page.goto('/edit')
  await page.getByRole('button', { name: 'Guest saved のその他の操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '削除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Guest saved を編集', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Guest saved を編集', exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})

test('corrupt local data remains untouched and cloud API requires authentication', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{broken'), key)
  await page.goto('/edit')
  await expect(page.getByRole('alert').filter({ hasText: '元のデータは変更していません' })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{broken')
  expect((await page.request.get('/api/workspace')).status()).toBe(401)
  expect((await page.request.put('/api/workspace', { headers: { Origin: 'http://127.0.0.1:3101' }, data: { accountId: 'guest:local', revision: 0, lists: [] } })).status()).toBe(401)
})

test('quota failure keeps draft and allows retry', async ({ page }) => {
  await page.goto('/create')
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Retry')
  await page.getByRole('textbox', { name: '表示する単語 1', exact: true }).fill('a')
  await page.evaluate(key => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) { Storage.prototype.setItem = original; throw new DOMException('Full', 'QuotaExceededError') }
      return original.call(this, name, value)
    }
  }, key)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'ブラウザーに保存できません' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('Retry')
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await expect(page.getByRole('button', { name: 'Retry を編集', exact: true })).toBeVisible()
})

test('GitHub session uses a separate workspace and signing out restores guest data', async ({ page }) => {
  let loggedIn = false
  await page.route('**/api/auth/session', route => route.fulfill({ json: loggedIn ? { user: { id: 'github:123', name: 'Cloud' }, expires: '2099-01-01' } : {} }))
  await page.route('**/api/workspace', route => route.fulfill({ json: { accountId: 'github:123', revision: 1, lists: [], devices: [] } }))
  await page.goto('/devices')
  await addDevice(page, 'Local only')
  await expect(page.getByRole('heading', { name: 'Local only', exact: true })).toBeVisible()
  const before = await page.evaluate(key => localStorage.getItem(key), key)
  loggedIn = true
  await page.reload()
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '端末はまだ登録されていません', exact: true })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(before)
  loggedIn = false
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Local only', exact: true })).toBeVisible()
})

test('guest changes propagate between tabs and deleted storage resets the workspace', async ({ page, context }) => {
  await page.goto('/devices')
  const other = await context.newPage()
  await other.goto('/devices')
  await expect(other.getByRole('heading', { name: '端末はまだ登録されていません', exact: true })).toBeVisible()
  await addDevice(page, 'Shared tab device')
  await expect(other.getByRole('heading', { name: 'Shared tab device', exact: true })).toBeVisible()
  await page.evaluate(key => localStorage.removeItem(key), key)
  await expect(other.getByRole('heading', { name: '端末はまだ登録されていません', exact: true })).toBeVisible()
})
