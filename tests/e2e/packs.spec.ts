import { test, expect, type Page } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))
const record = { date: '2026-09-10T00:00:00.000Z', time: 30, accuracy: 100, score: 100, mistakes: 0 }
const list = (id: string, packId: string, name: string, texts: string[], records: unknown[] = []) =>
  ({ id, packId, name, createdAt: '2026-09-01', words: words(...texts), records })

// Two packs of several lists, and two packs of one list.
function workspace() {
  return {
    version: 1, accountId: 'guest:local', revision: 1, devices: [],
    packs: [
      { id: 'shell', name: 'Shell', category: 'CLI', tags: ['unix'], createdAt: '2026-09-01' },
      { id: 'fruits', name: '果物', category: '食べ物', createdAt: '2026-09-02' },
      { id: 'solo', name: '単独', createdAt: '2026-09-03' },
      { id: 'plain-pack', name: 'Plain', createdAt: '2026-09-04' },
    ],
    lists: [
      list('basic', 'shell', '基本', ['ls', 'cd'], [record, record]),
      list('adv', 'shell', '応用', ['find', 'tar']),
      list('apple', 'fruits', 'りんご', ['apple']),
      list('solo-list', 'solo', '単独リスト', ['one', 'two', 'three'], [record]),
      list('plain', 'plain-pack', 'Plain', ['x']),
    ],
  }
}

function seed(page: Page) {
  return page.addInitScript(([key, raw]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw) }, [key, JSON.stringify(workspace())])
}
const saved = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), key)

test.beforeEach(async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 1280, height: 900 })
})

test('every pack is a row, also a pack of one list, and a row opens to show its lists', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/edit')
  await expect(page.getByRole('heading', { name: '単語パック', level: 1 })).toBeVisible()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(4)
  await expect(page.locator('li[data-list-id]')).toHaveCount(0)
  const shell = page.locator('li[data-pack-id="shell"]')
  await expect(shell).toContainText('2リスト')
  await expect(shell).toContainText('4語')
  await expect(shell).toContainText('CLI')
  const solo = page.locator('li[data-pack-id="solo"]')
  await expect(solo).toContainText('1リスト')
  await solo.getByRole('button', { name: '単独', exact: true }).click()
  await expect(solo.locator('li[data-list-id] h3')).toHaveText(['単独リスト'])
  expect(errors).toEqual([])
})

test('a search opens the packs that match, and the category filter narrows the packs', async ({ page }) => {
  await page.goto('/edit')
  await page.getByRole('searchbox', { name: /で検索/ }).fill('応用')
  await expect(page.locator('li[data-pack-id]')).toHaveCount(1)
  await expect(page.locator('li[data-pack-id="shell"] li[data-list-id] h3')).toHaveText(['応用'])
  await expect(page.getByText('1パック / 全4パック')).toBeVisible()
  await page.getByRole('button', { name: '検索をクリア' }).click()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(4)

  await page.getByRole('button', { name: /カテゴリ：/ }).click()
  await page.getByRole('menuitemradio', { name: /^食べ物/ }).click()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(1)
  await expect(page.locator('li[data-pack-id="fruits"]')).toBeVisible()
})

test('deleting a pack asks with the numbers of lists and records, then removes the pack and its lists', async ({ page }) => {
  await page.goto('/edit')
  await page.locator('li[data-pack-id="shell"]').getByRole('button', { name: 'Shell のパックの操作' }).click()
  await page.getByRole('menuitem', { name: '削除' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Shell を削除しますか？')
  await expect(dialog).toContainText('2リストと2件の記録も削除されます')
  await dialog.getByRole('button', { name: '削除' }).click()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(3)
  const workspace = await saved(page)
  expect(workspace.packs.map((pack: { id: string }) => pack.id)).toEqual(['fruits', 'solo', 'plain-pack'])
  expect(workspace.lists.map((item: { id: string }) => item.id)).toEqual(['apple', 'solo-list', 'plain'])
})

test('deleting the last list of a pack says the pack goes too, and removes it', async ({ page }) => {
  await page.goto('/edit')
  const solo = page.locator('li[data-pack-id="solo"]')
  await solo.getByRole('button', { name: '単独', exact: true }).click()
  await solo.getByRole('button', { name: '単独リスト のその他の操作' }).click()
  await page.getByRole('menuitem', { name: '削除' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('パック「単独」も削除されます')
  await dialog.getByRole('button', { name: '削除' }).click()
  await expect(page.locator('li[data-pack-id="solo"]')).toHaveCount(0)
  const workspace = await saved(page)
  expect(workspace.packs.map((pack: { id: string }) => pack.id)).toEqual(['shell', 'fruits', 'plain-pack'])
  expect(workspace.lists.map((item: { id: string }) => item.id)).toEqual(['basic', 'adv', 'apple', 'plain'])
})

test('a list that is not the last of its pack does not mention the pack', async ({ page }) => {
  await page.goto('/edit')
  const shell = page.locator('li[data-pack-id="shell"]')
  await shell.getByRole('button', { name: 'Shell', exact: true }).click()
  await shell.getByRole('button', { name: '応用 のその他の操作' }).click()
  await page.getByRole('menuitem', { name: '削除' }).click()
  await expect(page.getByRole('alertdialog')).not.toContainText('パック')
})

test('the pack in ?pack= is opened and in view', async ({ page }) => {
  await page.goto('/edit?pack=shell')
  const shell = page.locator('li[data-pack-id="shell"]')
  await expect(shell.getByRole('button', { name: 'Shell', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(shell.locator('li[data-list-id]')).toHaveCount(2)
})

test('a new pack is made with its fields and first list, and shown on /edit', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/packs/create')
  await expect(page.getByRole('heading', { name: 'パックを作成', level: 1 })).toBeVisible()
  await page.getByRole('textbox', { name: 'パック名', exact: false }).fill('Rust')
  await page.getByRole('combobox', { name: 'カテゴリ（任意）' }).click()
  const search = page.getByRole('combobox', { name: 'カテゴリを検索・作成' })
  await search.fill('プログラミング')
  await search.press('Enter')
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('基本')
  await page.getByRole('textbox', { name: '表示する単語 1', exact: true }).fill('fn')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  const rust = page.locator('li[data-pack-id]', { hasText: 'Rust' })
  await expect(rust).toContainText('プログラミング')
  await expect(rust.locator('li[data-list-id] h3')).toHaveText(['基本'])
  const workspace = await saved(page)
  const pack = workspace.packs.find((item: { name: string }) => item.name === 'Rust')
  expect(pack.category).toBe('プログラミング')
  const created = workspace.lists.filter((item: { packId: string }) => item.packId === pack.id)
  expect(created.map((item: { name: string }) => item.name)).toEqual(['基本'])
  expect(errors).toEqual([])
})

test('a pack needs a name that no other pack has', async ({ page }) => {
  await page.goto('/packs/create')
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('基本')
  await page.getByRole('textbox', { name: '表示する単語 1', exact: true }).fill('fn')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'パック名', exact: false })
  await expect(page.getByText('パック名を入力してください')).toBeVisible()
  await expect(name).toBeFocused()
  await name.fill(' shell ')
  await expect(page.getByText('パック名を入力してください')).toHaveCount(0)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('同じ名前のパックがあります')).toBeVisible()
  await expect(page).toHaveURL(/\/packs\/create/)
  await name.fill('Shell 2')
  await expect(page.getByText('同じ名前のパックがあります')).toHaveCount(0)
})

test('the pack fields are edited, and renaming a pack of one list leaves the list name', async ({ page }) => {
  await page.goto('/packs/edit?pack=solo')
  await expect(page.getByRole('heading', { name: 'パックを編集', level: 1 })).toBeVisible()
  await page.getByRole('textbox', { name: 'パック名', exact: false }).fill('ひとつ')
  await page.getByRole('textbox', { name: '説明', exact: false }).fill('一つだけのパック')
  await page.getByRole('combobox', { name: 'タグ（任意）' }).click()
  const search = page.getByRole('combobox', { name: 'タグを検索・作成' })
  await search.fill('メモ')
  await search.press('Enter')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=solo/)
  const row = page.locator('li[data-pack-id="solo"]')
  await expect(row).toContainText('ひとつ')
  await expect(row).toContainText('メモ')
  const workspace = await saved(page)
  const pack = workspace.packs.find((item: { id: string }) => item.id === 'solo')
  expect(pack).toMatchObject({ name: 'ひとつ', description: '一つだけのパック', tags: ['メモ'] })
  expect(workspace.lists.find((item: { id: string }) => item.id === 'solo-list').name).toBe('単独リスト')
})

test('the lists of a pack are reordered with the keyboard and the order is saved', async ({ page }) => {
  await page.goto('/packs/edit?pack=shell')
  const handles = () => page.getByRole('button', { name: /をドラッグして並べ替え/ })
  await expect(handles()).toHaveText(['', ''])
  await expect(page.getByRole('group', { name: '基本' })).toContainText('2語')
  await handles().first().focus()
  await page.keyboard.press('Space')
  await expect(handles().first()).toHaveAttribute('aria-pressed', 'true')
  // The sensor may not have measured the rows yet, so press again until the row below has moved up.
  await expect(async () => {
    await page.keyboard.press('ArrowDown', { delay: 100 })
    await expect(page.getByRole('group', { name: '応用' })).toHaveAttribute('style', /translate3d\(0px, -[1-9]/, { timeout: 2000 })
  }).toPass()
  await page.keyboard.press('Space')
  await expect(page.getByRole('group').filter({ has: handles() }).first()).toHaveAccessibleName('応用')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=shell/)
  const workspace = await saved(page)
  expect(workspace.lists.map((item: { id: string }) => item.id)).toEqual(['adv', 'basic', 'apple', 'solo-list', 'plain'])
})

test('leaving the pack editor with changes asks first, and without changes does not', async ({ page }) => {
  await page.goto('/packs/edit?pack=shell')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=shell$/)
  await page.goto('/packs/edit?pack=shell')
  await page.getByRole('textbox', { name: 'パック名', exact: false }).fill('Shell!')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('保存していない変更があります')
  await dialog.getByRole('button', { name: '編集を続ける' }).click()
  await expect(page).toHaveURL(/\/packs\/edit/)
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await dialog.getByRole('button', { name: '破棄して移動' }).click()
  await expect(page).toHaveURL(/\/edit/)
  expect((await saved(page)).packs[0].name).toBe('Shell')
})

test('a pack that was deleted says so and links to the packs', async ({ page }) => {
  await page.goto('/packs/edit?pack=gone')
  await expect(page.getByText('このパックは削除されています')).toBeVisible()
  await page.locator('#main-content').getByRole('link', { name: '単語パック' }).click()
  await expect(page).toHaveURL(/\/edit$/)
})
