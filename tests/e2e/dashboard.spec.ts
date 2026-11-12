import { test, expect } from '@playwright/test'
import { guestWorkspace } from './guestData'
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
    [key, guestWorkspace(lists)])
}

test('home keeps the introduction until the first practice record exists', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: '自分の単語で、タイピング練習。', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '練習の状況', exact: true })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'はじめる' }).getByRole('link', { name: '単語リストを作成', exact: true })).toHaveAttribute('href', '/create')
})

test('dashboard summarizes practice, suggests lists and opens the chosen list', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seedGuest(page)
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: '練習の状況', exact: true })).toBeVisible()
  await expect(page.getByText('このブラウザーに保存された記録から集計しています。')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'はじめる' }).getByRole('link', { name: '単語リストを作成', exact: true })).toHaveAttribute('href', '/create')

  // The list practised last comes first, with its best and its first words; its card holds the practice button.
  const resume = page.getByRole('region', { name: 'Recent', exact: true })
  await expect(resume).toContainText('続きから')
  await expect(resume).toContainText('ベスト 正確率 100%・4.00 秒')
  await expect(resume.getByRole('list', { name: '最初の単語' }).getByRole('listitem')).toHaveText(['a', 'b'])
  await expect(resume.getByRole('link', { name: 'Recent を練習する', exact: true })).toHaveAttribute('href', '/play?list=recent')
  await expect(resume.getByRole('link', { name: '別のリストを選ぶ', exact: true })).toHaveAttribute('href', '/edit')
  await expect(page.getByRole('navigation', { name: 'はじめる' }).getByRole('link', { name: '練習する', exact: true })).toHaveCount(0)

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

test('weak words are listed per list from the latest runs, and their button practises only them, unrecorded', async ({ page }) => {
  const now = Date.now()
  const words = ['alpha', 'beta', 'gamma', 'delta'].map(input => ({ display: input, input, annotation: `${input} / 意味` }))
  const record = (id: string, ago: number, missed?: { word: string; count: number }[], mode?: string) =>
    ({ id, date: new Date(now - ago).toISOString(), time: 5, mistakes: 1, accuracy: 90, wordCount: 4, ...(missed ? { missed } : {}), ...(mode ? { mode } : {}) })
  const lists = [{ id: 'weak', name: 'Weak', createdAt: '2026-09-01', words, records: [
    record('w1', 3 * day, [{ word: 'beta', count: 1 }, { word: 'removed', count: 3 }]),
    record('w2', 2 * day, [{ word: 'beta', count: 2 }, { word: 'gamma', count: 4 }]),
    record('w3', day, [{ word: 'delta', count: 5 }], 'writing'),
    record('w4', 60 * 1000),
  ] }]
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) }, [key, guestWorkspace(lists)])
  await page.goto('/home')
  const weak = page.getByRole('region', { name: '苦手な単語', exact: true })
  const items = weak.getByRole('list', { name: 'Weak の苦手な単語' }).getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText('beta')
  await expect(items.nth(0)).toContainText('2回')
  await expect(items.nth(1)).toContainText('gamma')
  await expect(items.nth(1)).toContainText('意味')
  await expect(weak).not.toContainText('delta')
  await weak.getByRole('link', { name: 'Weak の苦手な 2 語だけ練習する', exact: true }).click()
  await expect(page).toHaveURL(/\/play\?list=weak&review=weak$/)
  await expect(page.getByRole('status').filter({ hasText: '苦手な 2 語のおさらい（記録しません）' })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuemax', '2')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('beta')
  await input.pressSequentially('gamma')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('間違えた単語のおさらいは記録しません。')
})

test('a saved run keeps its missed words for the weak words', async ({ page }) => {
  const words = [{ display: 'ab', input: 'ab', annotation: '' }, { display: 'cd', input: 'cd', annotation: '' }]
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
    [key, guestWorkspace([{ id: 'save', name: 'Save', createdAt: '2026-09-01', words, records: [] }])])
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('ab')
  await input.pressSequentially('cx')
  await input.pressSequentially('d')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  await page.goto('/home')
  const items = page.getByRole('list', { name: 'Save の苦手な単語' }).getByRole('listitem')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('cd')
  await expect(items.first()).toContainText('1回')
})

test('an unknown list parameter falls back to the first list', async ({ page }) => {
  await seedGuest(page)
  await page.goto('/play?list=missing')
  await expect(page.getByRole('button', { name: 'Recent を選択中', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
