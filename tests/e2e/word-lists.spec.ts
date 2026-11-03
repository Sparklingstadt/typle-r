import { test, expect, type Page } from '@playwright/test'
import { openPacks } from './packRows'
import { guestWorkspace } from './guestData'
const key = 'typle-r:guest-workspace:v1'
const hour = 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))
const run = (id: string, wordCount: number, at: number) => ({ id, time: 10, accuracy: 100, mistakes: 0, wordCount, date: ago(at) })

function lists() {
  return [
    { id: 'fruits', name: 'Fruits', createdAt: '2026-09-01', words: words('apple', 'banana', 'cherry', 'grape', 'lemon', 'melon', 'kiwi'),
      records: [run('f1', 7, 60 * 1000), run('f2', 7, 30 * hour), run('f3', 6, 90 * hour)] },
    { id: 'kana', name: 'Kana', createdAt: '2026-09-02', words: words('a', 'i', 'u'), records: [] },
    { id: 'long', name: 'A very long list name that keeps going to check that the row still fits on a phone screen', createdAt: '2026-09-03', words: words('x'), records: [] },
  ]
}

function seed(page: Page, value: unknown[] = lists()) {
  return page.addInitScript(([key, raw]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw)
  }, [key, guestWorkspace(value)])
}

const saved = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null').lists, key)
const row = (page: Page, id: string) => page.locator(`li[data-list-id="${id}"]`)
const rowNames = (page: Page) => page.locator('li[data-list-id] h3').allInnerTexts()

test('lists show their words and use, and can be searched and ordered', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/edit')
  await openPacks(page)
  await expect(page.getByRole('heading', { level: 1, name: '単語パック', exact: true })).toBeVisible()
  // Where the data is saved shows once: in the top bar, or beside the heading on a phone, where the top bar hides it.
  await expect(page.getByRole('banner', { name: 'トップバー' })).toContainText('このブラウザーに保存')
  await expect(page.getByRole('main').getByText('このブラウザーに保存')).toBeHidden()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('main').getByText('このブラウザーに保存')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  // Newest first by default.
  expect(await rowNames(page)).toEqual([lists()[2].name, 'Kana', 'Fruits'])
  await expect(row(page, 'fruits')).toContainText('apple・banana・cherry・grape・lemon・melon ほか1語')
  await expect(row(page, 'fruits')).toContainText('練習 3回 · 最終 今日')
  await expect(row(page, 'kana')).toContainText('まだ練習していません')
  await expect(row(page, 'fruits').getByRole('link', { name: 'Fruits を練習' })).toHaveAttribute('href', '/play?list=fruits')

  await page.getByRole('searchbox', { name: 'パック名・リスト名・カテゴリ・タグ・単語で検索' }).fill('KIWI')
  expect(await rowNames(page)).toEqual(['Fruits'])
  await expect(page.getByText('1パック / 全3パック')).toBeVisible()
  await page.getByRole('searchbox').fill('nothing')
  await expect(page.getByText('「nothing」に一致するパックはありません。')).toBeVisible()
  await page.getByRole('button', { name: '検索をクリア' }).first().click()
  expect(await rowNames(page)).toHaveLength(3)

  await page.getByRole('button', { name: '並び順：追加した順' }).click()
  await page.getByRole('menuitemradio', { name: '最近練習した順' }).click()
  expect((await rowNames(page))[0]).toBe('Fruits')

  await row(page, 'fruits').getByRole('button', { name: 'Fruits のその他の操作' }).click()
  await expect(page.getByRole('menuitem', { name: 'ベスト記録を見る' })).toHaveAttribute('href', '/rankings?list=fruits')
  await expect(page.getByRole('menuitem', { name: /練習記録を見る/ })).toHaveAttribute('href', '/records?list=fruits')
  await page.keyboard.press('Escape')
  await row(page, 'kana').getByRole('button', { name: 'Kana のその他の操作' }).click()
  await expect(page.getByRole('menuitem', { name: 'ベスト記録を見る' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  expect(errors).toEqual([])
})

test('the editor has its own URL, asks before going back with changes, and returns to the edited row', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto('/edit')
  await openPacks(page)
  await page.evaluate(() => window.scrollTo(0, 200))
  await page.getByRole('button', { name: 'Fruits を編集', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?list=fruits$/)
  await expect(page.getByRole('heading', { level: 1, name: '単語リストを編集' })).toBeInViewport()
  await expect(page.getByText('7語 · 練習 3回 · 最終 今日')).toBeVisible()

  // Without changes, back returns to the lists and focuses the row's edit button.
  await page.goBack()
  await expect(page).toHaveURL(/\/edit$/)
  await expect(page.getByRole('button', { name: 'Fruits を編集', exact: true })).toBeFocused()

  await page.getByRole('button', { name: 'Fruits を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '表示する単語 7', exact: true }).press('Enter')
  await page.getByRole('textbox', { name: '表示する単語 8', exact: true }).fill('mango')
  // Two runs were at 7 words; they stay, but no longer count towards the best.
  await expect(page.getByText('単語数が7語から8語に変わります。7語で練習した記録（2件）は残りますが、ベスト記録の順位には含まれなくなります。')).toBeVisible()
  await page.goBack()
  const confirm = page.getByRole('alertdialog', { name: '保存していない変更があります' })
  await expect(confirm).toBeVisible()
  await expect(page).toHaveURL(/\/edit\?list=fruits$/)
  await confirm.getByRole('button', { name: '編集を続ける' }).click()
  await expect(page.getByRole('textbox', { name: '表示する単語 8', exact: true })).toHaveValue('mango')

  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await expect(page.getByRole('button', { name: 'Fruits を編集', exact: true })).toBeFocused()
  await expect(row(page, 'fruits')).toHaveClass(/bg-green-50/)
  expect((await saved(page)).find((list: { id: string }) => list.id === 'fruits').words).toHaveLength(8)

  // Opening the URL directly works, and キャンセル returns to the lists.
  await page.goto('/edit?list=kana')
  await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('Kana')
  await page.getByRole('button', { name: '単語パック', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.goto('/edit?list=missing')
  await expect(page.getByText('開こうとした単語リストは見つかりません。')).toBeVisible()
})

test('the sidebar link asks before dropping changes, and later edits still return to the lists', async ({ page }) => {
  await seed(page)
  await page.goto('/edit')
  await openPacks(page)
  const sidebar = page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '単語パック', exact: true })
  await page.getByRole('button', { name: 'Kana を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Kana 2')
  await sidebar.click()
  await expect(page.getByRole('alertdialog', { name: '保存していない変更があります' })).toBeVisible()
  await expect(page).toHaveURL(/\/edit\?list=kana$/)
  await page.getByRole('button', { name: '破棄して移動' }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await expect(row(page, 'kana')).toContainText('Kana')
  // Without changes the sidebar link simply returns; opening and cancelling afterwards stays on the lists.
  await page.getByRole('button', { name: 'Kana を編集', exact: true }).click()
  await sidebar.click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.getByRole('button', { name: 'Kana を編集', exact: true }).click()
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await expect(page.getByRole('button', { name: 'Kana を編集', exact: true })).toBeFocused()
  expect((await saved(page)).find((list: { id: string }) => list.id === 'kana').name).toBe('Kana')
})

test('copy and delete from the menu, with what is lost spelled out', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/edit')
  await openPacks(page)
  await page.getByRole('button', { name: 'Fruits のその他の操作' }).click()
  await page.getByRole('menuitem', { name: '複製' }).click()
  await expect(page.getByLabel('通知', { exact: true }).getByText('「Fruits（コピー）」を作成しました。')).toBeVisible()
  // The copy joins the pack of the list it was made from, after it.
  expect(await page.locator('li[data-pack-id="pack-fruits"] li[data-list-id] h3').allInnerTexts()).toEqual(['Fruits', 'Fruits（コピー）'])
  const copy = (await saved(page)).at(-1)
  expect(copy).toMatchObject({ name: 'Fruits（コピー）', records: [] })
  expect(copy.words).toHaveLength(7)

  await page.getByRole('button', { name: 'Fruits のその他の操作' }).click()
  await page.getByRole('menuitem', { name: '削除' }).click()
  const dialog = page.getByRole('alertdialog', { name: '「Fruits」を削除しますか？' })
  await expect(dialog).toContainText('単語リストと、このリストの練習記録をすべて削除します。')
  await expect(dialog).toContainText('7語 · 練習記録 3件（最終 今日）')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'CSVエクスポート' }).click()
  expect(await (await download).failure()).toBeNull()
  await dialog.getByRole('button', { name: '削除する' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, 'fruits')).toHaveCount(0)
  // Focus moves to the row now in its place: the copy, which followed Fruits.
  await expect(page.getByRole('button', { name: 'Fruits（コピー） を編集', exact: true })).toBeFocused()
  expect((await saved(page)).map((list: { id: string }) => list.id)).not.toContain('fruits')
})

test('fits a phone without horizontal scrolling and keeps every action reachable', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/edit')
  await openPacks(page)
  await expect(row(page, 'long')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  for (const id of ['long', 'kana', 'fruits']) {
    const box = await row(page, id).getByRole('button', { name: /のその他の操作$/ }).boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  }
  // The menu of each pack row is reachable too.
  for (const id of ['pack-long', 'pack-kana', 'pack-fruits']) {
    const box = await page.locator(`li[data-pack-id="${id}"]`).getByRole('button', { name: /のパックの操作$/ }).first().boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  }
  await expect(row(page, 'fruits')).toContainText('7語 · 練習 3回 · 最終 今日')
  await row(page, 'kana').getByRole('button', { name: 'Kana のその他の操作' }).click()
  await expect(page.getByRole('menuitem', { name: 'このリストを練習' })).toHaveAttribute('href', '/play?list=kana')
})

test('empty and failed loads say different things', async ({ page }) => {
  await page.addInitScript(([k, raw]) => localStorage.setItem(k, raw), [key, guestWorkspace([], { revision: 2 })])
  await page.goto('/edit')
  await expect(page.getByRole('heading', { name: '単語パックはまだありません' })).toBeVisible()
  // With no list yet, a list is made first: packs are put together from lists.
  await expect(page.getByRole('link', { name: '単語リストを作成', exact: true })).toHaveAttribute('href', '/create')

  const broken = await page.context().newPage()
  await broken.addInitScript(k => localStorage.setItem(k, '{broken'), key)
  await broken.goto('/edit')
  await expect(broken.getByRole('alert').filter({ hasText: '元のデータは変更していません' })).toBeVisible()
  await expect(broken.getByRole('button', { name: '再読み込み' })).toBeVisible()
  await expect(broken.getByRole('heading', { name: '単語パックはまだありません' })).toHaveCount(0)
})
