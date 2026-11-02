import { test, expect, type Page } from '@playwright/test'
import { guestWorkspace } from './guestData'
const key = 'typle-r:guest-workspace:v1'
const modeKey = 'typle-r:practice-mode'

// A short list covering the three kinds of hint recall mode shows: an annotation that contains the answer, a display
// text that differs from what is typed, and no hint at all.
const words = [
  { display: 'apple', input: 'apple', annotation: 'apple / りんご' },
  { display: '東京', input: 'tokyo', annotation: '' },
  { display: 'cat', input: 'cat', annotation: '' },
]
const run = (id: string, time: number, accuracy: number, mode?: 'recall') =>
  ({ id, time, accuracy, mistakes: accuracy === 100 ? 0 : 1, wordCount: words.length, date: new Date(Date.now() - 60000).toISOString(), ...(mode ? { mode } : {}) })

// Puts the list in this browser before the first page loads; later loads keep what the page saved.
function seed(page: Page, records: unknown[] = []) {
  return page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, [key, guestWorkspace([{ id: 'fruits', name: 'Fruits', createdAt: '2026-11-01', words, records }])])
}
async function savedRecords(page: Page) {
  const workspace = JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? 'null', key))
  return workspace.lists.find((list: { id: string }) => list.id === 'fruits').records as { mode?: string; accuracy: number }[]
}
const toggle = (page: Page) => page.getByRole('button', { name: '思い出して打つ', exact: true })
const field = (page: Page) => page.getByRole('textbox', { name: '表示された文字を入力', exact: true })

async function typeAll(page: Page) {
  for (const word of words) await field(page).pressSequentially(word.input)
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
}

test('recall mode hides the answer and saves a recall record', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await page.goto('/play')
  await expect(page.getByRole('button', { name: 'Fruits を選択中', exact: true })).toBeVisible()
  // Normal mode shows the answer and the coming words.
  await expect(page.getByText('apple / りんご', { exact: true })).toBeVisible()
  await expect(page.getByText('次の単語', { exact: true })).toBeVisible()
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')

  // The note leaves out the part before the slash, which is the answer; the answer is one placeholder per character.
  await expect(page.getByText('りんご', { exact: true })).toBeVisible()
  await expect(page.getByText(/apple/)).toHaveCount(0)
  await expect(page.locator('#wordDisplay')).toHaveText('＿＿＿＿＿')
  await expect(page.getByText('次の単語', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'すべての単語を表示' })).toHaveCount(0)
  await expect(page.getByText('入力する文字', { exact: true })).toHaveCount(0)

  await field(page).pressSequentially('apple')
  // A display text that differs from the input is the hint, without the "type this" guide.
  await expect(page.locator('#wordHint')).toHaveText('東京')
  await expect(page.locator('#wordDisplay')).toHaveText('＿＿＿＿＿')
  await expect(page.getByText('入力する文字', { exact: true })).toHaveCount(0)
  await field(page).pressSequentially('tokyo')
  await expect(page.getByText('ヒントがありません', { exact: true })).toBeVisible()
  await field(page).pressSequentially('cat')

  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('練習記録を保存しました。')
  await expect(result).toContainText('思い出して打つ')
  const records = await savedRecords(page)
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ mode: 'recall', accuracy: 100 })
  expect(errors).toEqual([])
})

test('revealing the answer counts the rest as mistakes', async ({ page }) => {
  await seed(page)
  await page.goto('/play')
  await toggle(page).click()
  const stats = page.getByLabel('練習中の記録', { exact: true })
  await expect(stats).toContainText('ミス0')
  await field(page).pressSequentially('ap')
  await expect(page.locator('#wordDisplay')).toHaveText('ap＿＿＿')
  const reveal = page.getByRole('button', { name: '答えを見る', exact: true })
  await reveal.click()
  // The three characters not yet typed count as mistakes, once; the answer shows and the input keeps the focus.
  await expect(stats).toContainText('ミス3')
  await expect(page.locator('#wordDisplay')).toHaveText('apple')
  await expect(reveal).toBeDisabled()
  await expect(field(page)).toBeFocused()
  // The word still has to be typed; the next one starts hidden again, with the button back.
  await field(page).pressSequentially('ple')
  await expect(page.locator('#wordHint')).toHaveText('東京')
  await expect(page.locator('#wordDisplay')).toHaveText('＿＿＿＿＿')
  await expect(reveal).toBeEnabled()
  await expect(stats).toContainText('ミス3')
})

test('the toggle is locked while practising', async ({ page }) => {
  await seed(page)
  await page.goto('/play')
  await expect(toggle(page)).toBeEnabled()
  await field(page).pressSequentially('a')
  await expect(toggle(page)).toBeDisabled()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  // Starting again frees it.
  await field(page).press('Escape')
  await expect(toggle(page)).toBeEnabled()
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  await field(page).pressSequentially('a')
  await expect(toggle(page)).toBeDisabled()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
})

test('the recall toggle is remembered after reload', async ({ page }) => {
  await seed(page)
  await page.goto('/play')
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(key => localStorage.getItem(key), modeKey)).toBe('recall')
  await page.reload()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('りんご', { exact: true })).toBeVisible()
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('apple / りんご', { exact: true })).toBeVisible()
})

test('rankings separate recall records', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play')
  // One normal run without mistakes, then one recall run that reveals the first answer.
  await typeAll(page)
  await page.getByRole('button', { name: /もう一度/ }).click()
  await toggle(page).click()
  await page.getByRole('button', { name: '答えを見る', exact: true }).click()
  await typeAll(page)
  const records = await savedRecords(page)
  expect(records.map(record => record.mode ?? 'normal').sort()).toEqual(['normal', 'recall'])
  expect(records.find(record => record.mode === 'recall')!.accuracy).toBeLessThan(100)

  await page.goto('/rankings')
  await expect(page.getByRole('radio', { name: '通常', exact: true })).toHaveAttribute('aria-checked', 'true')
  const rows = page.getByRole('table', { name: 'Fruits の上位の記録', exact: true }).locator('tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('100%')

  await page.getByRole('radio', { name: '思い出す', exact: true }).click()
  await expect(page).toHaveURL(/\/rankings\?mode=recall$/)
  await expect(rows).toHaveCount(1)
  await expect(rows).not.toContainText('100%')

  await page.goto('/rankings?mode=recall')
  await expect(page.getByRole('radio', { name: '思い出す', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(rows).toHaveCount(1)
  await expect(rows).not.toContainText('100%')

  // The records page lists both runs; only the recall one has the badge, and each is the best of its mode.
  await page.goto('/records')
  const items = page.getByRole('listitem').filter({ hasText: 'Fruits' })
  await expect(items).toHaveCount(2)
  await expect(items.filter({ hasText: '思い出す' })).toHaveCount(1)
})

test('switching the ranking order keeps recall', async ({ page }) => {
  await seed(page, [run('n1', 5, 100), run('n2', 4, 90), run('r1', 7, 100, 'recall'), run('r2', 6, 80, 'recall')])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/rankings?mode=recall')
  const times = page.getByRole('table', { name: 'Fruits の上位の記録', exact: true }).locator('tbody tr td:first-of-type')
  await expect(times).toHaveText(['7.00秒', '6.00秒'])

  await page.getByRole('radio', { name: '速さを優先', exact: true }).click()
  await expect(page).toHaveURL(/\/rankings\?order=speed&mode=recall$/)
  await expect(page.getByRole('radio', { name: '思い出す', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(times).toHaveText(['6.00秒', '7.00秒'])

  await page.getByRole('region', { name: '単語リスト', exact: true }).getByRole('button', { name: /^Fruits/ }).click()
  await expect(page).toHaveURL(/\/rankings\?list=fruits&order=speed&mode=recall$/)
  await expect(times).toHaveText(['6.00秒', '7.00秒'])

  await page.getByRole('radio', { name: '正確率を優先', exact: true }).click()
  await expect(page).toHaveURL(/\/rankings\?list=fruits&mode=recall$/)
  await expect(times).toHaveText(['7.00秒', '6.00秒'])
})
