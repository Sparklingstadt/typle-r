import { test, expect } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const day = 24 * 60 * 60 * 1000

function seedGuest(page: import('@playwright/test').Page) {
  const now = Date.now()
  const words = [{ display: 'a', input: 'a', annotation: '' }, { display: 'b', input: 'b', annotation: '' }]
  const record = (id: string, ago: number, time: number, accuracy: number) => ({ id, date: new Date(now - ago).toISOString(), time, mistakes: 0, accuracy, wordCount: 2 })
  const lists = [
    { id: 'recent', name: 'Recent', createdAt: '2026-09-01', words, records: [record('r1', 2 * day, 6, 90), record('r2', day, 5, 95), record('r3', 60 * 1000, 4, 100)] },
    { id: 'stale', name: 'Stale', createdAt: '2026-09-01', words, records: [record('s1', 10 * day, 8, 100)] },
    { id: 'unused', name: 'Unused', createdAt: '2026-09-01', words, records: [] },
  ]
  return page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
    [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists, devices: [] })])
}

test('home keeps the introduction until the first practice record exists', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: '自分の単語で、タイピング練習。', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '練習の状況', exact: true })).toHaveCount(0)
})

test('dashboard summarizes practice, suggests lists and opens the chosen list', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seedGuest(page)
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: '練習の状況', exact: true })).toBeVisible()
  await expect(page.getByText('このブラウザーに保存された記録から集計しています。')).toBeVisible()

  const summary = page.getByRole('region', { name: '今週のまとめ', exact: true })
  await expect(summary.getByRole('definition').filter({ hasText: '今日も練習済み' })).toBeVisible()
  await expect(summary).toContainText('連続練習3日')

  const next = page.getByRole('region', { name: '次に練習するリスト', exact: true })
  await expect(next.getByRole('listitem')).toHaveCount(2)
  await expect(next.getByRole('listitem').nth(0)).toContainText('まだ練習していません')
  await expect(next.getByRole('listitem').nth(1)).toContainText('10日間練習していません')

  const recent = page.getByRole('article', { name: 'Recent', exact: true })
  await expect(recent).toContainText('最新 2.00 秒')
  await expect(recent).toContainText('直近2回の平均は、その前の記録より 0.75 秒速い')
  const chart = recent.getByRole('slider', { name: '1単語あたりの秒数（左右キーで各回の値を表示）', exact: true })
  await chart.focus()
  await expect(chart).toHaveAttribute('aria-valuenow', '3')
  await chart.press('Home')
  await expect(chart).toHaveAttribute('aria-valuenow', '1')
  await expect(chart).toHaveAttribute('aria-valuetext', / 3\.00 秒$/)
  await expect(page.getByRole('article', { name: 'Stale', exact: true })).toContainText('記録が2回以上になると推移を表示します。')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await next.getByRole('link', { name: 'Stale を練習する', exact: true }).click()
  await expect(page).toHaveURL(/\/play\?list=stale$/)
  await expect(page.getByRole('button', { name: 'Stale を選択中', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('an unknown list parameter falls back to the first list', async ({ page }) => {
  await seedGuest(page)
  await page.goto('/play?list=missing')
  await expect(page.getByRole('button', { name: 'Recent を選択中', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
