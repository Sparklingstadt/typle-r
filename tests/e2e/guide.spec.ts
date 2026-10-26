import { test, expect } from '@playwright/test'

test('the guide has a table of contents that jumps to each section below the top bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/guide')
  await expect(page.getByRole('heading', { name: '使い方', level: 1 })).toBeVisible()
  const contents = page.getByRole('navigation', { name: 'このページの内容' })
  await expect(contents.getByRole('link')).toHaveText(['練習する', '単語リストを作る', '結果と記録を見る', '端末を登録する', '保存先とデータ', 'キーボード操作'])

  await contents.getByRole('link', { name: '保存先とデータ' }).click()
  await expect(page).toHaveURL(/\/guide#storage$/)
  const heading = page.getByRole('heading', { name: '保存先とデータ', level: 2 })
  await expect(heading).toBeInViewport()
  // The sticky 56px top bar must not cover the section heading.
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(56)
  await expect(page.getByRole('heading', { name: 'データが消えるとき' })).toBeVisible()
  // The table of contents stays in view beside the text on wide screens.
  await expect(contents).toBeInViewport()
})

test('the guide links to each screen and shows the practice colors and keys', async ({ page }) => {
  await page.goto('/guide')
  const start = page.getByRole('region', { name: 'はじめの3ステップ' })
  await expect(start.getByRole('link', { name: '練習する' })).toHaveAttribute('href', '/play')
  await expect(start.getByRole('link', { name: 'パックを作成' })).toHaveAttribute('href', '/packs/create')
  await expect(start.getByRole('link', { name: 'ベスト記録' })).toHaveAttribute('href', '/rankings')

  const practice = page.getByRole('region', { name: '練習する' })
  await expect(practice.locator('[data-state="done"]')).not.toHaveCount(0)
  await expect(practice.locator('[data-state="current"]')).toHaveCount(1)
  await expect(practice.locator('[data-state="error"]')).toHaveCount(1)

  const keys = page.getByRole('region', { name: 'キーボード操作' })
  await expect(keys.locator('kbd', { hasText: 'Esc' })).toBeVisible()
  await expect(keys.getByText('保存する（Mac は ⌘ + Enter）')).toBeVisible()
  await expect(page.getByRole('region', { name: '単語リストを作る' }).getByLabel('CSVファイルの例')).toContainText('input,display,annotation')

  await start.getByRole('link', { name: 'パックを作成' }).click()
  await expect(page).toHaveURL(/\/packs\/create$/)
})

test('on a phone the table of contents comes first and the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/guide')
  const contents = page.getByRole('navigation', { name: 'このページの内容' })
  await expect(contents).toBeInViewport()
  const tocBox = (await contents.boundingBox())!
  const startBox = (await page.getByRole('heading', { name: 'はじめの3ステップ' }).boundingBox())!
  expect(tocBox.y).toBeLessThan(startBox.y)
  await contents.getByRole('link', { name: 'キーボード操作' }).click()
  await expect(page.getByRole('heading', { name: 'キーボード操作', level: 2 })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
