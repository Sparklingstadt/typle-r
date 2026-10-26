import { test, expect, type Page } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))
const member = (id: string, levels: string[], ...texts: string[]) =>
  ({ id, name: `Shell：${levels.join('・')}`, group: 'Shell', levels, createdAt: '2026-09-01', words: words(...texts), records: [] })

function lists() {
  return [
    member('basic-1', ['基本', '初級'], 'ls', 'cd'),
    member('basic-2', ['基本', '上級'], 'find'),
    member('options-1', ['オプション', '初級'], 'ls -la'),
    { id: 'plain', name: 'Plain', createdAt: '2026-09-02', words: words('x'), records: [] },
    member('options-2', ['オプション', '上級'], 'tar -xzf'),
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

test('the lists of a group are one row that opens to show each of them', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/edit')
  const group = page.locator('li[data-pack-id="pack-basic-1"]')
  const toggle = group.getByRole('button', { name: 'Shell', exact: true })
  await expect(group).toContainText('4リスト')
  await expect(group).toContainText('5語')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  // The list without a group is a pack row of its own, closed like this one.
  await expect(page.locator('li[data-pack-id]')).toHaveCount(2)
  await expect(page.locator('li[data-list-id]')).toHaveCount(0)
  await group.getByRole('button', { name: 'Shell のパックの操作' }).click()
  await expect(page.getByRole('menuitem', { name: '練習', exact: true })).toHaveAttribute('href', '/play?list=basic-1')
  await page.keyboard.press('Escape')

  await toggle.click()
  await expect(group.getByRole('list', { name: 'Shell のリスト' }).locator('li[data-list-id] h3')).toHaveText(['Shell：基本・初級', 'Shell：基本・上級', 'Shell：オプション・初級', 'Shell：オプション・上級'])

  // A list of the group is edited as before, and keeps its group and levels.
  await group.getByRole('button', { name: 'Shell：基本・上級 を編集' }).click()
  await expect(page.getByRole('combobox', { name: 'パック', exact: true })).toHaveValue('pack-basic-1')
  await expect(page.getByRole('textbox', { name: '難易度 1', exact: true })).toHaveValue('基本')
  await expect(page.getByRole('textbox', { name: '難易度 2', exact: true })).toHaveValue('上級')
  await page.getByRole('textbox', { name: '表示する単語 1', exact: true }).fill('find .')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('「Shell：基本・上級」を更新しました。')).toBeVisible()
  expect((await saved(page)).find((list: { id: string }) => list.id === 'basic-2')).toMatchObject({ group: 'Shell', levels: ['基本', '上級'], words: [{ display: 'find .' }] })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await toggle.click()
  await page.getByRole('searchbox', { name: 'パック名・リスト名・カテゴリ・タグ・単語で検索' }).fill('tar')
  await expect(page.locator('li[data-list-id] h3')).toHaveText(['Shell：オプション・上級'])
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(errors).toEqual([])
})

test('a group is one choice on the practice screen, and its levels are chosen one after another', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=plain')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  const shell = aside.getByRole('button', { name: /^Shell/ })
  await expect(shell).toHaveAttribute('aria-expanded', 'false')
  await expect(shell).toContainText('4リスト · 難易度を選ぶ')
  await shell.click()
  const levels = aside.getByRole('group', { name: 'Shell の難易度' })
  await expect(levels.getByRole('button')).toHaveText(['基本', 'オプション'])
  await levels.getByRole('button', { name: 'オプション' }).click()
  await expect(levels.getByRole('button', { name: 'オプション' })).toHaveAttribute('aria-pressed', 'true')
  await expect(levels.getByRole('group', { name: '難易度の2段目' }).getByRole('button')).toHaveText(['初級', '上級'])
  await levels.getByRole('button', { name: '上級' }).click()
  await expect(page.locator('#wordDisplay')).toHaveText('tar -xzf')
  await expect(page.getByRole('button', { name: '単語リストを切り替える（現在: Shell › オプション・上級）' })).toBeVisible()
  // The group of the list being practised stays open at its levels.
  await expect(aside.getByRole('button', { name: /^Shell/ })).toContainText('オプション・上級 · 1語 · 記録なし')
  await expect(levels.getByRole('button', { name: '上級' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '単語リストを切り替える（現在: Shell › オプション・上級）' }).click()
  const dialog = page.getByRole('dialog', { name: '単語リストを選ぶ' })
  await dialog.getByRole('button', { name: '基本', exact: true }).click()
  await dialog.getByRole('button', { name: '初級', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('#wordDisplay')).toHaveText('ls')
})

test('the initial Kotlin syntax lists are one list with 初級1 to 上級2', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=arch-linux')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  await aside.getByRole('searchbox').fill('Kotlin構文')
  await aside.getByRole('button', { name: /^Kotlin構文/ }).click()
  const levels = aside.getByRole('group', { name: 'Kotlin構文 の難易度' })
  await expect(levels.getByRole('group', { name: '難易度の1段目' }).getByRole('button')).toHaveText(['初級1', '初級2', '中級', '上級1', '上級2'])
  await levels.getByRole('button', { name: '中級' }).click()
  await expect(page.getByRole('button', { name: '単語リストを切り替える（現在: Kotlin構文 › 中級）' })).toBeVisible()
})
