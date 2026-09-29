import { test, expect, type Page } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const minute = 60 * 1000
const day = 24 * 60 * minute
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const mac = { id: 'mac', name: 'MacBook Air', layout: 'JIS' }
const hhkb = { id: 'hhkb', name: 'HHKB', layout: 'US' }
const words = [{ display: 'ab', input: 'ab', annotation: '' }]

function lists() {
  return [
    { id: 'typing', name: 'Typing', createdAt: '2026-09-01', words, records: [
      { id: 'a1', time: 3.5, date: ago(minute), mistakes: 0, accuracy: 100, wordCount: 5, device: mac },
      { id: 'a2', time: 4, date: ago(2 * minute), mistakes: 0, accuracy: 100, wordCount: 5, device: mac },
      { id: 'a3', time: 3, date: ago(day), mistakes: 1, accuracy: 95, wordCount: 5, device: hhkb },
      // Saved before accuracy, word count and devices were recorded.
      { time: 5.5, date: ago(10 * day) },
    ] },
    { id: 'countries', name: 'Countries', createdAt: '2026-09-01', words, records: [
      { id: 'b1', time: 70, date: ago(day), mistakes: 3, accuracy: 85, wordCount: 20, device: mac },
    ] },
    { id: 'unused', name: 'Unused', createdAt: '2026-09-01', words, records: [] },
  ]
}

function seed(page: Page, value: unknown[] = lists()) {
  return page.addInitScript(([key, raw]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw)
  }, [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: value, devices: [mac, hhkb] })])
}

const rows = (page: Page) => page.locator('[data-record-key]')
const row = (page: Page, text: string) => rows(page).filter({ hasText: text })

test('records are grouped by day, marked with the best, and filtered through the URL', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await page.goto('/records')
  await expect(page.getByText('5件', { exact: true })).toBeVisible()
  const today = page.getByRole('region', { name: /^今日 · / })
  await expect(today.locator('[data-record-key]')).toHaveCount(2)
  await expect(today).toContainText('2回 · 8秒')
  await expect(rows(page).first()).toContainText('ベスト')
  await expect(row(page, 'Countries')).toContainText('1分10.00秒')
  await expect(row(page, 'Countries')).toContainText('85%')
  await expect(row(page, 'Countries')).toContainText('3.50秒/語')
  await expect(rows(page).last()).toContainText('端末の記録なし')
  await expect(page.getByText(/「—」は記録されていない項目です/)).toBeVisible()

  await page.getByRole('button', { name: /リストで絞り込む/ }).click()
  await page.getByRole('menuitemradio', { name: /^Typing/ }).click()
  await expect(page).toHaveURL(/\/records\?list=typing$/)
  await expect(page.getByText('4件 / 全5件', { exact: true })).toBeVisible()
  const summary = page.getByRole('region', { name: 'Typing', exact: true })
  await expect(summary).toContainText('練習 4回 · 最終 今日')
  await expect(summary.getByRole('link', { name: '練習する' })).toHaveAttribute('href', '/play?list=typing')
  // Every row belongs to the list, so rows are titled by device instead.
  await expect(rows(page).first().getByRole('heading')).toHaveText('MacBook Air（JIS）')

  // The filter lives in the URL, so it survives a reload and can be linked to.
  await page.reload()
  await expect(page.getByText('4件 / 全5件', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '絞り込みを解除' }).click()
  await expect(page).toHaveURL(/\/records$/)
  await expect(rows(page)).toHaveCount(5)

  await page.goto('/records?device=none')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('5.50秒')

  await page.goto('/records?list=unused')
  await expect(page.getByRole('heading', { name: '「Unused」の記録はまだありません' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'このリストを練習する' })).toHaveAttribute('href', '/play?list=unused')
  await expect(page.getByRole('region', { name: 'Unused', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('deleting the best record explains the change and keeps focus in the list', async ({ page }) => {
  await seed(page)
  await page.goto('/records')
  const first = rows(page).first().getByRole('button', { name: /の記録を削除$/ })
  const second = rows(page).nth(1).getByRole('button', { name: /の記録を削除$/ })
  const secondName = await second.getAttribute('aria-label')

  // Escape keeps the record and returns focus to the button that opened the dialog.
  await first.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog', { name: 'この練習記録を削除しますか？' })
  await expect(dialog).toContainText('3.50秒')
  await expect(dialog).toContainText('このリストのベスト記録です。削除すると、ベストは 4.00秒（100%）になります。')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(first).toBeFocused()

  await page.keyboard.press('Enter')
  await dialog.getByRole('button', { name: '削除する' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'を削除しました。' })).toContainText('「Typing」の練習記録（')
  // The next record moved into the deleted row's place and has the focus, ready for another deletion.
  await expect(page.getByRole('button', { name: secondName ?? '' })).toBeFocused()
  await expect(rows(page)).toHaveCount(4)
  await expect(rows(page).first()).toContainText('ベスト')
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').lists[0].records.map((record: { id?: string }) => record.id ?? null), key)
  expect(stored).toEqual(['a2', 'a3', null])
})

test('long histories show 50 records at a time', async ({ page }) => {
  const many = Array.from({ length: 55 }, (_, index) => ({ id: `r${index}`, time: 3 + index / 100, date: ago((index + 1) * minute), mistakes: 0, accuracy: 100, wordCount: 5 }))
  await seed(page, [{ id: 'many', name: 'Many', createdAt: '2026-09-01', words, records: many }])
  await page.goto('/records')
  await expect(rows(page)).toHaveCount(50)
  await page.getByRole('button', { name: 'さらに表示（残り 5件）' }).click()
  await expect(rows(page)).toHaveCount(55)
  await expect(page.getByRole('button', { name: /さらに表示/ })).toHaveCount(0)
})

test('on a phone every record fits the screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page)
  await page.goto('/records')
  await expect(rows(page)).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const countries = row(page, 'Countries')
  await expect(countries).toContainText('1分10.00秒')
  await expect(countries).toContainText('ミス 3')
  const button = await countries.getByRole('button', { name: /の記録を削除$/ }).boundingBox()
  expect(button && button.x + button.width).toBeLessThanOrEqual(390)
})

test('without records the page explains how to get one', async ({ page }) => {
  await page.goto('/records')
  await expect(page.getByRole('heading', { name: 'まだ練習記録がありません' })).toBeVisible()
  await expect(page.getByRole('link', { name: '練習する' })).toHaveAttribute('href', '/play')
})
