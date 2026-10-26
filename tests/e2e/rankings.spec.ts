import { test, expect, type Page } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const minute = 60 * 1000
const hour = 60 * minute
const day = 24 * hour
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const mac = { id: 'mac', name: 'MacBook Air', layout: 'JIS' }
const hhkb = { id: 'hhkb', name: 'HHKB', layout: 'US' }
const word = (text: string) => ({ display: text, input: text, annotation: '' })
const run = (id: string, time: number, accuracy: number, wordCount: number, at: number, device: typeof mac) =>
  ({ id, time, accuracy, mistakes: accuracy === 100 ? 0 : 1, wordCount, date: ago(at), device })

function lists() {
  return [
    // Three words now; e1 is from when the list had two, so it is faster but not comparable.
    { id: 'english', name: 'English', createdAt: '2026-09-01', words: [word('ab'), word('cd'), word('ef')], records: [
      run('e1', 4, 100, 2, 20 * day, mac),
      run('e2', 6, 100, 3, 2 * day, hhkb),
      run('e3', 5.5, 96, 3, day, mac),
      run('e4', 5, 100, 3, hour, mac),
      run('e5', 7, 98, 3, 3 * day, hhkb),
      run('e6', 8, 100, 3, 4 * day, hhkb),
      run('e7', 9, 90, 3, 5 * day, mac),
    ] },
    { id: 'kana', name: 'Kana', createdAt: '2026-09-01', words: [word('a')], records: [run('k1', 2, 100, 1, 3 * day, hhkb)] },
    { id: 'edited', name: 'Edited', createdAt: '2026-09-01', words: [word('ab')], records: [run('x1', 1, 100, 2, 10 * day, mac)] },
    { id: 'empty', name: 'Empty list', createdAt: '2026-09-01', words: [word('a')], records: [] },
  ]
}

function seed(page: Page, value: unknown[] = lists()) {
  return page.addInitScript(([key, raw]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw)
  }, [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: value, devices: [mac, hhkb] })])
}

const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)

test('ranks runs at the current word count, switches order and device, and keeps the view in the URL', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/rankings')
  await expect(page.getByRole('heading', { level: 1, name: 'ベスト記録', exact: true })).toBeVisible()
  // Where the data is saved shows once, in the top bar; the page's own badge is only for narrow screens.
  await expect(page.getByRole('banner', { name: 'トップバー' })).toContainText('このブラウザーに保存')
  await expect(page.getByRole('main').getByText('このブラウザーに保存', { exact: true })).toBeHidden()
  const lists = page.getByRole('region', { name: '単語リスト', exact: true })
  // The most recently practised list opens first, and its best was set within the last week.
  await expect(lists.getByRole('button', { name: /^English/ })).toHaveAttribute('aria-current', 'true')
  await expect(lists.getByRole('button', { name: /^English/ })).toContainText('更新')
  await expect(lists.getByRole('heading', { name: 'まだ記録のないリスト（1）' })).toBeVisible()

  const table = page.getByRole('table', { name: 'English の上位の記録', exact: true })
  const times = table.locator('tbody tr td:first-of-type')
  await expect(times).toHaveText(['5.00秒', '6.00秒', '8.00秒', '7.00秒', '5.50秒'])
  await expect(page.getByText('5 / 6件', { exact: true })).toBeVisible()
  await expect(page.getByText('単語数が今と違う1件は順位に含めていません。')).toBeVisible()
  await page.getByRole('button', { name: '含めて表示', exact: true }).click()
  await expect(times.first()).toHaveText('4.00秒2語')
  await page.getByRole('button', { name: '含めない', exact: true }).click()
  await expect(times.first()).toHaveText('5.00秒')
  await page.getByRole('button', { name: 'すべて表示（6件）', exact: true }).click()
  await expect(times).toHaveCount(6)
  await expect(page.getByRole('link', { name: 'このリストを練習', exact: true })).toHaveAttribute('href', '/play?list=english')
  await expect(page.getByRole('link', { name: '記録を見る', exact: true })).toHaveAttribute('href', '/records?list=english')

  await page.getByRole('radio', { name: '速さを優先', exact: true }).click()
  await expect(page).toHaveURL(/\/rankings\?order=speed$/)
  await expect(times).toHaveText(['5.00秒', '5.50秒', '6.00秒', '7.00秒', '8.00秒', '9.00秒'])

  await page.getByRole('button', { name: '端末で絞り込む（現在：すべての端末）', exact: true }).click()
  await page.getByRole('menuitemradio', { name: /HHKB/ }).click()
  await expect(page).toHaveURL(/\/rankings\?device=hhkb&order=speed$/)
  await expect(times).toHaveText(['6.00秒', '7.00秒', '8.00秒'])
  await expect(lists.getByRole('heading', { name: 'この端末の記録がないリスト（2）' })).toBeVisible()

  await lists.getByRole('button', { name: /^Kana/ }).click()
  await expect(page).toHaveURL(/\/rankings\?list=kana&device=hhkb&order=speed$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Kana', exact: true })).toBeVisible()
  // Kana has no MacBook runs, so the detail moves to a list that has some.
  await page.getByRole('button', { name: /^端末で絞り込む/ }).click()
  await page.getByRole('menuitemradio', { name: /MacBook Air/ }).click()
  await expect(page).toHaveURL(/\/rankings\?device=mac&order=speed$/)
  await expect(page.getByRole('heading', { level: 2, name: 'English', exact: true })).toBeVisible()
  await expect(times).toHaveText(['5.00秒', '5.50秒', '9.00秒'])

  await page.reload()
  await expect(page.getByRole('radio', { name: '速さを優先', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: '端末で絞り込む（現在：MacBook Air（JIS））', exact: true })).toBeVisible()

  await page.goto('/rankings?list=empty')
  await expect(page.getByRole('heading', { name: 'まだ練習していません', exact: true })).toBeVisible()
  await lists.getByRole('searchbox', { name: 'リストを検索', exact: true }).fill('zzz')
  await expect(lists).toContainText('「zzz」に一致するリストはありません。')
  await lists.getByRole('button', { name: '検索をクリア', exact: true }).last().click()
  await expect(lists.getByRole('button', { name: /^Kana/ })).toBeVisible()
  expect(await overflows(page)).toBe(false)
  expect(errors).toEqual([])
})

test('on phones the list and the detail are separate steps that follow the back button', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/rankings')
  const lists = page.getByRole('region', { name: '単語リスト', exact: true })
  await expect(lists).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'English', exact: true })).toBeHidden()
  await expect(lists.locator('[aria-current]')).toHaveCount(0)

  await lists.getByRole('button', { name: /^Kana/ }).click()
  await expect(page).toHaveURL(/\/rankings\?list=kana$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Kana', exact: true })).toBeFocused()
  await expect(lists).toBeHidden()
  await expect(page.getByRole('list', { name: 'Kana の上位の記録', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Kana の上位の記録', exact: true })).toBeHidden()
  expect(await overflows(page)).toBe(false)
  await page.goBack()
  await expect(lists).toBeVisible()

  await lists.getByRole('button', { name: /^English/ }).click()
  await expect(page.getByRole('list', { name: 'English の上位の記録', exact: true }).getByRole('listitem')).toHaveCount(5)
  expect(await overflows(page)).toBe(false)
  await page.getByRole('button', { name: 'リスト一覧', exact: true }).click()
  await expect(page).toHaveURL(/\/rankings$/)
  await expect(lists.getByRole('button', { name: /^English/ })).toBeFocused()

  // Opened from a link, the device is kept and the missing runs are explained.
  await page.goto('/rankings?list=kana&device=mac')
  await expect(page.getByRole('heading', { name: '「MacBook Air（JIS）」で練習した記録はありません' })).toBeVisible()
  await page.getByRole('button', { name: 'すべての端末の記録を表示', exact: true }).click()
  await expect(page).toHaveURL(/\/rankings\?list=kana$/)
  await expect(page.getByRole('list', { name: 'Kana の上位の記録', exact: true })).toBeVisible()
})

test('practice, records and the ranking agree on the best of an edited list', async ({ page }) => {
  await seed(page)
  await page.goto('/play?list=english')
  await expect(page.getByRole('table', { name: 'ベスト記録 上位5件', exact: true }).locator('tbody tr').first()).toContainText('5.00 秒')
  await expect(page.getByText('正確率が高い順・同じなら速い順・今の3語の記録', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'すべてのベスト記録', exact: true })).toHaveAttribute('href', '/rankings?list=english')

  await page.goto('/records?list=english')
  const summary = page.getByRole('region', { name: 'English', exact: true })
  await expect(summary).toContainText('5.00秒')
  await expect(page.getByRole('listitem').filter({ hasText: '5.00秒' }).getByText('ベスト', { exact: true })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '4.00秒' }).getByText('ベスト', { exact: true })).toHaveCount(0)
  await summary.getByRole('link', { name: 'ベスト記録', exact: true }).click()
  await expect(page).toHaveURL(/\/rankings\?list=english$/)
  await expect(page.getByRole('heading', { level: 2, name: 'English', exact: true })).toBeVisible()

  // The only earlier run of "Edited" had two words, so this one-word run starts a new ranking.
  await page.goto('/play?list=edited')
  await page.getByRole('textbox', { name: '表示された文字を入力', exact: true }).pressSequentially('ab')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('今の1語では最初の記録')
  await expect(result).toContainText('このリストの 1 位です。')
  await page.goto('/rankings?list=edited')
  await expect(page.getByRole('table', { name: 'Edited の上位の記録', exact: true }).locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('単語数が今と違う1件は順位に含めていません。')).toBeVisible()
})

test('empty and unreadable storage explain what to do instead of showing an empty ranking', async ({ page }) => {
  await seed(page, [{ id: 'fresh', name: 'Fresh', createdAt: '2026-09-01', words: [word('a')], records: [] }])
  await page.goto('/rankings')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'まだベスト記録がありません', exact: true })).toBeVisible()
  await expect(main.getByRole('link', { name: '練習する', exact: true })).toHaveAttribute('href', '/play')
  await expect(main.getByRole('link', { name: '単語パックを作る', exact: true })).toHaveAttribute('href', '/packs/create')

  await page.evaluate(key => localStorage.setItem(key, '{broken'), key)
  await page.reload()
  await expect(main.getByRole('alert')).toContainText('保存データを読み込めません')
  await expect(main.getByRole('button', { name: '再読み込み', exact: true })).toBeVisible()
  await expect(main.getByText('まだベスト記録がありません')).toHaveCount(0)
})
