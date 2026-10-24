import { test, expect, type Page } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))
const member = (id: string, levels: string[], ...texts: string[]) =>
  ({ id, name: `Shell：${levels.join('・')}`, group: 'Shell', levels, category: 'プログラミング', createdAt: '2026-09-01', words: words(...texts), records: [] })
const sql = 'SELECT customers.name, SUM(orders.total_amount) AS lifetime_value FROM customers INNER JOIN orders ON orders.customer_id = customers.id WHERE orders.created_at >= CURRENT_DATE - INTERVAL \'365 days\' GROUP BY customers.name ORDER BY lifetime_value DESC;'

function lists() {
  return [
    { id: 'fruits', name: 'Fruits', category: '語学', tags: ['英語'], createdAt: '2026-09-02', records: [], words: [
      { display: 'りんご', input: 'ringo', annotation: '赤い果物' },
      { display: 'banana', input: 'banana', annotation: '' },
    ] },
    { id: 'sql', name: 'SQL', category: 'プログラミング', createdAt: '2026-09-03', records: [], words: [{ display: sql, input: sql, annotation: '1年間の購入額' }] },
    member('basic-1', ['基本', '初級'], 'ls', 'cd'),
    member('basic-2', ['基本', '上級'], 'find'),
  ]
}

function seed(page: Page, value = lists()) {
  return page.addInitScript(([key, raw]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw)
  }, [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: value, devices: [] })])
}

const fitsWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

test('the sidebar opens the words of a list, and another list or a level of a group can be chosen', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/home')
  const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' })
  await navigation.getByRole('link', { name: '単語一覧', exact: true }).click()
  await expect(page).toHaveURL(/\/words$/)
  await expect(page.getByRole('heading', { level: 1, name: '単語一覧' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: '単語一覧', exact: true })).toHaveAttribute('aria-current', 'page')

  // The first list is shown in two columns: the number, and the text to type with its note under it. A word without
  // a note shows only the text to type.
  const table = page.getByRole('table', { name: 'Fruits' })
  await expect(table.getByRole('columnheader')).toHaveText(['#番号', '入力する文字'])
  await expect(table.getByRole('row').nth(1).getByRole('cell')).toHaveText(['1', /^ringo\s+赤い果物$/], { useInnerText: true })
  await expect(table.getByRole('row').nth(2).getByRole('cell')).toHaveText(['2', 'banana'], { useInnerText: true })
  const [input, note] = await table.getByRole('row').nth(1).getByRole('cell').nth(1).evaluate(cell =>
    [...cell.children].map(child => child.getBoundingClientRect()))
  expect(note.top).toBeGreaterThanOrEqual(input.bottom)
  await expect(page.getByRole('link', { name: 'Fruits を練習' })).toHaveAttribute('href', '/play?list=fruits')
  await expect(page.getByRole('link', { name: 'Fruits を編集' })).toHaveAttribute('href', '/edit?list=fruits')

  // The lists to choose from are those of the practice screen: narrowed down by category, with a group chosen by its levels.
  const aside = page.getByRole('complementary', { name: '単語リスト' })
  await aside.getByRole('combobox', { name: 'カテゴリで絞り込む' }).selectOption({ label: 'プログラミング（3）' })
  await expect(aside.getByRole('button', { name: 'Fruits を選択' })).toHaveCount(0)
  await aside.getByRole('button', { name: 'SQL を選択' }).click()
  await expect(page).toHaveURL(/\/words\?list=sql$/)
  const long = page.getByRole('table', { name: 'SQL' })
  await expect(long.getByRole('row').nth(1).getByRole('cell').nth(1)).toHaveText(`${sql}\n1年間の購入額`, { useInnerText: true })
  // A long statement wraps inside its cell instead of widening the table.
  expect(await long.evaluate(table => table.scrollWidth <= table.parentElement!.clientWidth)).toBe(true)
  expect(await fitsWidth(page)).toBe(true)

  const group = aside.locator('li[data-group="Shell"]')
  await group.getByRole('button', { expanded: false }).click()
  await group.getByRole('button', { name: '基本', exact: true }).click()
  await group.getByRole('button', { name: '上級', exact: true }).click()
  await expect(page).toHaveURL(/\/words\?list=basic-2$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Shell：基本・上級' })).toBeVisible()
  await expect(page.getByText('Shell・基本・上級 · 1語')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Shell：基本・上級' }).getByRole('row')).toHaveCount(2)

  // The chosen list is kept in the URL, so it survives a reload.
  await page.reload()
  await expect(page.getByRole('table', { name: 'Shell：基本・上級' })).toBeVisible()
  expect(errors).toEqual([])
})

test('at the end of a long list the lists beside it stay below the top bar', async ({ page }) => {
  const many = Array.from({ length: 40 }, (_, index) => ({ id: `list-${index}`, name: `List ${index}`, category: '語学', createdAt: '2026-09-01', records: [],
    words: words(...Array.from({ length: index ? 3 : 80 }, (_, word) => `word${word}`)) }))
  await seed(page, many)
  await page.setViewportSize({ width: 1100, height: 700 })
  await page.goto('/words?list=list-0')
  await expect(page.getByRole('table', { name: 'List 0' }).getByRole('row')).toHaveCount(81)
  const aside = page.getByRole('complementary', { name: '単語リスト' })
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  // Taller than the window allows, the lists would be pushed up under the top bar by the end of the words.
  const bar = await page.getByRole('banner').evaluate(element => element.getBoundingClientRect().bottom)
  await expect.poll(() => aside.evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThan(bar + 16)
  await expect(aside.getByRole('heading', { name: '単語リスト' })).toBeInViewport()
})

test('on a phone the drawer opens the words, which fit the width, and the list is chosen in a dialog', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/home')
  const open = page.getByRole('button', { name: 'メニューを開く' })
  const drawer = page.getByRole('dialog', { name: 'メニュー' })
  await open.click()
  await drawer.getByRole('link', { name: '単語一覧', exact: true }).click()
  await expect(page).toHaveURL(/\/words$/)
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('complementary', { name: '単語リスト' })).toBeHidden()

  // A phone shows the same two columns.
  const fruits = page.getByRole('table', { name: 'Fruits' })
  await expect(fruits.getByRole('columnheader')).toHaveText(['#番号', '入力する文字'])
  await expect(fruits.getByRole('row').nth(1).getByRole('cell').nth(1)).toHaveText('ringo赤い果物')

  await page.getByRole('button', { name: '単語リストを選ぶ（現在: Fruits）' }).click()
  const picker = page.getByRole('dialog', { name: '単語リストを選ぶ' })
  await picker.getByRole('searchbox', { name: 'リスト名・カテゴリ・タグで絞り込む' }).fill('sql')
  await picker.getByRole('button', { name: 'SQL を選択' }).click()
  await expect(picker).toBeHidden()
  await expect(page).toHaveURL(/\/words\?list=sql$/)
  const long = page.getByRole('table', { name: 'SQL' })
  await expect(long.getByRole('row').nth(1)).toContainText(sql)
  expect(await long.evaluate(table => table.scrollWidth <= table.parentElement!.clientWidth)).toBe(true)
  expect(await fitsWidth(page)).toBe(true)
})

test('a list that is not there says so, and without lists the page offers to create one', async ({ page, browser }) => {
  await seed(page)
  await page.goto('/words?list=missing')
  await expect(page.getByText('開こうとした単語リストは見つかりません。削除された可能性があります。')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Fruits' })).toBeVisible()

  const context = await browser.newContext()
  const empty = await context.newPage()
  await seed(empty, [])
  await empty.goto('/words')
  await expect(empty.getByRole('heading', { name: '単語リストはまだありません' })).toBeVisible()
  await expect(empty.getByRole('main').getByRole('link', { name: '新しいリストを作成' })).toHaveAttribute('href', '/create')
  await context.close()
})
