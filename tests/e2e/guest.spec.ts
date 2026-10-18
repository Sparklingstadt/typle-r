import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
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

test('guest can create, import, export, edit, practice, manage devices and delete', async ({ page }) => {
  const errors: string[] = []
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
  expect(errors).toEqual([])
})

test('corrupt local data remains untouched', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{broken'), key)
  await page.goto('/edit')
  await expect(page.getByRole('alert').filter({ hasText: '元のデータは変更していません' })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{broken')
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

test('about page explains features and that data stays in this browser, and opens GitHub in a new tab', async ({ page }) => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
  await page.goto('/about')
  await expect(page).toHaveTitle('Typleについて | Typle')
  await expect(page.getByRole('heading', { name: 'Typleについて', exact: true, level: 1 })).toBeVisible()
  const features = page.getByRole('region', { name: 'できること', exact: true })
  for (const [name, path] of [['リストを作成', '/create'], ['練習する', '/play'], ['ベスト記録', '/rankings']]) {
    await expect(features.getByRole('link', { name, exact: true })).toHaveAttribute('href', path)
  }
  const storage = page.getByRole('region', { name: 'データの保存先', exact: true })
  await expect(storage.getByRole('heading', { name: 'このブラウザー', exact: true })).toBeVisible()
  await expect(storage.getByRole('heading', { name: 'アカウント', exact: true })).toHaveCount(0)
  await expect(storage).toContainText('別の端末やブラウザーとは同期しません')
  const version_ = page.getByRole('region', { name: 'バージョンと開発', exact: true })
  await expect(version_).toContainText(`v${version}`)
  const github = version_.getByRole('link', { name: /^GitHub\s*（新しいタブで開く）$/ })
  await expect(github).toHaveAttribute('target', '_blank')
  await expect(github).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(version_).toContainText('非公開のリポジトリです')
  await features.getByRole('link', { name: '練習する', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/play$/)
  await page.goto('/about')
  await storage.getByRole('link', { name: '使い方の「保存先とデータ」', exact: true }).click()
  await expect(page).toHaveURL(/\/guide#storage$/)
  await expect(page.getByRole('heading', { name: '保存先とデータ', exact: true })).toBeInViewport()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/about')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('a guest’s lists of removed profiles are merged after the first profile’s once', async ({ page }) => {
  const list = (id: string, name: string) => ({ id, name, createdAt: '2026-10-01T00:00:00.000Z', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] })
  // As the app with profiles saved it; set only before the first load, so later loads read what the app saved.
  const legacy = JSON.stringify({ version: 1, accountId: 'guest:local', revision: 2, lists: [list('main', 'Main')], devices: [],
    profiles: [{ id: 'default', name: 'メイン' }, { id: 'zh', name: '中国語', lists: [list('zh-list', '中文'), list('dup', 'Main')] }] })
  await page.addInitScript(([key, value]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, value) }, [key, legacy])
  await page.goto('/edit')
  for (const name of ['Main', '中文', 'Main（中国語）']) await expect(page.getByRole('button', { name: `${name} を編集`, exact: true })).toBeVisible()
  const stored = JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? '{}', key))
  expect([stored.revision, 'profiles' in stored, stored.lists.map((item: { id: string }) => item.id)]).toEqual([3, false, ['main', 'zh-list', 'dup']])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Main（中国語） を編集', exact: true })).toBeVisible()
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? '{}', key)).revision).toBe(3)
})
