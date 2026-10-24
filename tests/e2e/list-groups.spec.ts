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

const saved = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null').lists, key)

test('the lists of a group are one row that opens to show each of them', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/edit')
  const group = page.locator('li[data-group="Shell"]')
  const toggle = group.getByRole('button', { name: 'Shell', exact: true })
  await expect(group).toContainText('難易度別に4リスト')
  await expect(group).toContainText('5語')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('li[data-list-id]')).toHaveCount(1)
  await expect(group.getByRole('link', { name: 'Shell を練習' })).toHaveAttribute('href', '/play?list=basic-1')

  await toggle.click()
  await expect(group.getByRole('list', { name: 'Shell のリスト' }).locator('li[data-list-id] h3')).toHaveText(['Shell：基本・初級', 'Shell：基本・上級', 'Shell：オプション・初級', 'Shell：オプション・上級'])

  // A list of the group is edited as before, and keeps its group and levels.
  await group.getByRole('button', { name: 'Shell：基本・上級 を編集' }).click()
  await page.getByRole('combobox', { name: 'カテゴリ（任意）' }).click()
  await page.getByRole('combobox', { name: 'カテゴリを検索・作成' }).fill('プログラミング')
  await page.getByRole('option', { name: '「プログラミング」を作成' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('「Shell：基本・上級」を更新しました。')).toBeVisible()
  expect((await saved(page)).find((list: { id: string }) => list.id === 'basic-2')).toMatchObject({ group: 'Shell', levels: ['基本', '上級'], category: 'プログラミング' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await toggle.click()
  await page.getByRole('searchbox', { name: 'リスト名・カテゴリ・タグ・単語で検索' }).fill('tar')
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
  await expect(page.getByRole('button', { name: '単語リストを切り替える（現在: Shell：オプション・上級）' })).toBeVisible()
  // The group of the list being practised stays open at its levels.
  await expect(aside.getByRole('button', { name: /^Shell/ })).toContainText('オプション・上級 · 1語 · 記録なし')
  await expect(levels.getByRole('button', { name: '上級' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '単語リストを切り替える（現在: Shell：オプション・上級）' }).click()
  const dialog = page.getByRole('dialog', { name: '単語リストを選ぶ' })
  await dialog.getByRole('button', { name: '基本', exact: true }).click()
  await dialog.getByRole('button', { name: '初級', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('#wordDisplay')).toHaveText('ls')
})

test('the initial Linux commands are one list with 基本, オプション and 応用', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=vercel-cli')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  await aside.getByRole('searchbox').fill('Linuxコマンド')
  await aside.getByRole('button', { name: /^Linuxコマンド/ }).click()
  const levels = aside.getByRole('group', { name: 'Linuxコマンド の難易度' })
  await expect(levels.getByRole('group', { name: '難易度の1段目' }).getByRole('button')).toHaveText(['基本', 'オプション', '応用'])
  await levels.getByRole('button', { name: '応用' }).click()
  await levels.getByRole('button', { name: '中級2' }).click()
  await expect(page.getByRole('button', { name: '単語リストを切り替える（現在: Linuxコマンド：応用（中級2））' })).toBeVisible()
})
