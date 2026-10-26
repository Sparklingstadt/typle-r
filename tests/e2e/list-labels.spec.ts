import { test, expect, type Page } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))

function lists() {
  return [
    { id: 'go', name: 'Go basics', category: 'プログラミング', tags: ['Go', 'CLI'], createdAt: '2026-09-01', words: words('go run', 'go test'), records: [] },
    { id: 'sql', name: 'SQL basics', category: 'プログラミング', tags: ['PostgreSQL'], createdAt: '2026-09-02', words: words('select'), records: [] },
    { id: 'english', name: 'English', category: '語学', tags: ['英語'], createdAt: '2026-09-03', words: words('apple'), records: [] },
    { id: 'plain', name: 'Plain', createdAt: '2026-09-04', words: words('x'), records: [] },
  ]
}

function seed(page: Page) {
  return page.addInitScript(([key, raw]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw)
  }, [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: lists(), devices: [] })])
}

// The saved lists as a screen sees them: a list's category and tags are its pack's, and a pack of two or more lists is a group.
const saved = (page: Page) => page.evaluate(k => {
  const { lists, packs } = JSON.parse(localStorage.getItem(k) ?? 'null')
  return lists.map((list: { packId: string }) => {
    const pack = packs.find((item: { id: string }) => item.id === list.packId)
    const group = lists.filter((item: { packId: string }) => item.packId === list.packId).length >= 2 ? { group: pack.name } : {}
    return { ...list, ...group, ...(pack.category ? { category: pack.category } : {}), ...(pack.tags ? { tags: pack.tags } : {}) }
  })
}, key)
const row = (page: Page, id: string) => page.locator(`li[data-list-id="${id}"]`)
const rowNames = (page: Page) => page.locator('li[data-list-id] h3').allInnerTexts()

test('lists show their category and tags and can be narrowed down by them', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/edit')
  await expect(row(page, 'go').locator('[data-list-labels]')).toHaveText(/プログラミング.*#.*Go.*#.*CLI/)
  await expect(row(page, 'plain').locator('[data-list-labels]')).toHaveCount(0)

  await page.getByRole('button', { name: 'カテゴリ：すべてのカテゴリ' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'プログラミング 2' })).toBeVisible()
  await page.getByRole('menuitemradio', { name: 'プログラミング 2' }).click()
  expect(await rowNames(page)).toEqual(['SQL basics', 'Go basics'])
  await expect(page.getByText('2件 / 全4件')).toBeVisible()

  // Tags narrow down further: a list must have every chosen tag.
  await page.getByRole('button', { name: 'すべてのタグ' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Go 1' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'CLI 1' }).click()
  await page.keyboard.press('Escape')
  expect(await rowNames(page)).toEqual(['Go basics'])
  await expect(page.getByRole('button', { name: 'タグ：Go・CLI' })).toBeVisible()
  await page.getByRole('button', { name: 'タグ：Go・CLI' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'PostgreSQL 1' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('条件に一致するリストはありません。')).toBeVisible()
  await page.getByRole('button', { name: '検索と絞り込みを解除' }).click()
  expect(await rowNames(page)).toHaveLength(4)

  await page.getByRole('button', { name: 'カテゴリ：すべてのカテゴリ' }).click()
  await page.getByRole('menuitemradio', { name: 'カテゴリなし 1' }).click()
  expect(await rowNames(page)).toEqual(['Plain'])
  await page.getByRole('button', { name: '絞り込みを解除' }).click()

  // The search finds lists by a category or tag too.
  await page.getByRole('searchbox', { name: 'リスト名・カテゴリ・タグ・単語で検索' }).fill('postgres')
  expect(await rowNames(page)).toEqual(['SQL basics'])
  await page.getByRole('searchbox').fill('語学')
  expect(await rowNames(page)).toEqual(['English'])
  expect(errors).toEqual([])
})

test('the editor chooses the category and tags from those in use or creates them, and a copy keeps them', async ({ page }) => {
  await seed(page)
  await page.goto('/edit?list=plain')
  const category = page.getByRole('combobox', { name: 'カテゴリ（任意）' })
  const tags = page.getByRole('combobox', { name: 'タグ（任意）' })
  const options = page.getByRole('listbox').getByRole('option')
  await expect(category).toHaveText('カテゴリを選ぶ')

  // A new category is created from what is typed and chosen at once.
  await category.click()
  await expect(options).toHaveText(['プログラミング', '語学'])
  const categorySearch = page.getByRole('combobox', { name: 'カテゴリを検索・作成' })
  await categorySearch.fill(' 音楽 ')
  await expect(options).toHaveText(['「音楽」を作成'])
  await categorySearch.press('Enter')
  await expect(category).toHaveText('音楽')
  await expect(category).toBeFocused()
  // One in use is chosen from the list, filtered by what is typed.
  await category.click()
  await categorySearch.fill('ぷろ')
  await expect(options).toHaveText(['「ぷろ」を作成', 'カテゴリを外す'])
  await categorySearch.fill('プロ')
  await options.filter({ hasText: 'プログラミング' }).click()
  await expect(category).toHaveText('プログラミング')

  // Tags stay open to choose several; Enter creates the typed one and stays in the search box.
  await tags.click()
  await expect(options).toHaveText(['CLI', 'Go', 'PostgreSQL', '英語'])
  const tagSearch = page.getByRole('combobox', { name: 'タグを検索・作成' })
  await tagSearch.fill('Kotlin')
  await tagSearch.press('Enter')
  await expect(tagSearch).toBeFocused()
  await expect(tagSearch).toHaveValue('')
  await tagSearch.fill('JVM, kotlin, Gradle')
  await expect(options).toHaveText(['「JVM, Gradle」を作成'])
  await options.first().click()
  await options.filter({ hasText: /^Go$/ }).click()
  await expect(page.getByRole('list', { name: '付けたタグ' }).getByRole('listitem')).toHaveText(['Kotlin', 'JVM', 'Gradle', 'Go'])
  // Choosing a chosen tag again takes it off.
  await options.filter({ hasText: /^Go$/ }).click()
  await page.keyboard.press('Escape')
  await expect(tags).toBeFocused()
  await page.getByRole('button', { name: 'タグ「JVM」を外す' }).click()
  await expect(page.getByText('未保存の変更があります')).toBeVisible()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('「Plain」を更新しました。')).toBeVisible()
  expect((await saved(page)).find((list: { id: string }) => list.id === 'plain')).toMatchObject({ category: 'プログラミング', tags: ['Kotlin', 'Gradle'] })
  await expect(row(page, 'plain').locator('[data-list-labels]')).toHaveText(/プログラミング.*Kotlin.*Gradle/)

  await row(page, 'plain').getByRole('button', { name: 'Plain のその他の操作' }).click()
  await page.getByRole('menuitem', { name: '複製' }).click()
  await expect(page.getByText('「Plain（コピー）」を作成しました。')).toBeVisible()
  expect((await saved(page)).at(-1)).toMatchObject({ name: 'Plain（コピー）', category: 'プログラミング', tags: ['Kotlin', 'Gradle'] })

  // Clearing both leaves them out of the saved list, as before they existed.
  await page.goto('/edit?list=plain')
  await page.getByRole('combobox', { name: 'カテゴリ（任意）' }).click()
  await page.getByRole('option', { name: 'カテゴリを外す' }).click()
  await page.getByRole('button', { name: 'タグ「Kotlin」を外す' }).click()
  await page.getByRole('button', { name: 'タグ「Gradle」を外す' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('「Plain」を更新しました。')).toBeVisible()
  const plain = (await saved(page)).find((list: { id: string }) => list.id === 'plain')
  expect('category' in plain || 'tags' in plain).toBe(false)
})

test('the practice screen shows the labels and narrows the lists to choose by category', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=go')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  const options = aside.getByRole('list', { name: '単語リスト' }).getByRole('button')
  await expect(options).toHaveCount(4)
  await expect(aside.getByRole('button', { name: 'Go basics を選択中' })).toContainText('#Go')
  await aside.getByRole('combobox', { name: 'カテゴリで絞り込む' }).selectOption({ label: '語学（1）' })
  await expect(options).toHaveText([/English/])
  await aside.getByRole('combobox', { name: 'カテゴリで絞り込む' }).selectOption({ label: 'すべてのカテゴリ' })
  await aside.getByRole('searchbox', { name: '単語リストをリスト名・カテゴリ・タグで絞り込む' }).fill('postgresql')
  await expect(options).toHaveText([/SQL basics/])

  await page.getByRole('button', { name: '単語リストを切り替える（現在: Go basics）' }).click()
  const dialog = page.getByRole('dialog', { name: '単語リストを選ぶ' })
  await dialog.getByRole('combobox', { name: 'カテゴリで絞り込む' }).selectOption({ label: 'カテゴリなし（1）' })
  await expect(dialog.getByRole('list', { name: '単語リストの候補' }).getByRole('button')).toHaveText([/Plain/])
})

test('the initial lists come with their category and tags', async ({ page }) => {
  await page.goto('/edit')
  await page.getByRole('searchbox', { name: 'リスト名・カテゴリ・タグ・単語で検索' }).fill('Kotlin構文（初級1）')
  await expect(page.locator('li[data-list-id="kotlin-syntax-beginner-1"] [data-list-labels]')).toHaveText(/プログラミング.*Kotlin/)
  await page.getByRole('searchbox').fill('小文字・初級1')
  await expect(page.locator('li[data-list-id="un-member-states-chinese-193-lowercase-beginner-1"] [data-list-labels]')).toHaveText(/語学.*中国語.*国名/)
})
