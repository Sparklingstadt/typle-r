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
  await expect(page.getByText('パック「Shell」を削除しました。')).toBeVisible()
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

const choice = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true })

test('a new pack is made of lists already saved, which move into it; a pack left with none goes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/packs/create')
  await expect(page.getByRole('heading', { name: 'パックを作成', level: 1 })).toBeVisible()
  // The words of a list are not entered here: lists are made on their own.
  await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'パック名', exact: false }).fill('Mix')
  await page.getByRole('combobox', { name: 'カテゴリ（任意）' }).click()
  const search = page.getByRole('combobox', { name: 'カテゴリを検索・作成' })
  await search.fill('まとめ')
  await search.press('Enter')
  // A list of a pack of several lists is shown with its pack.
  await expect(page.getByRole('listitem').filter({ has: choice(page, '応用') })).toContainText('パック「Shell」')
  await page.getByRole('searchbox', { name: '単語リストを名前で絞り込む' }).fill('単独')
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await choice(page, '単独リスト').check()
  await page.getByRole('searchbox', { name: '単語リストを名前で絞り込む' }).fill('')
  await choice(page, '応用').check()
  await expect(page.getByText('2件を選択中')).toBeVisible()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  const mix = page.locator('li[data-pack-id]', { hasText: 'Mix' })
  await expect(mix).toContainText('まとめ')
  // The lists keep the order they were offered in.
  await expect(mix.locator('li[data-list-id] h3')).toHaveText(['応用', '単独リスト'])
  const workspace = await saved(page)
  const pack = workspace.packs.find((item: { name: string }) => item.name === 'Mix')
  expect(pack.category).toBe('まとめ')
  expect(workspace.lists.filter((item: { packId: string }) => item.packId === pack.id).map((item: { id: string }) => item.id)).toEqual(['adv', 'solo-list'])
  // 単独 had only 単独リスト, so it is gone; Shell keeps 基本. The records move with the list.
  expect(workspace.packs.map((item: { id: string }) => item.id)).toEqual(['shell', 'fruits', 'plain-pack', pack.id])
  expect(workspace.lists.find((item: { id: string }) => item.id === 'solo-list').records).toEqual([record])
  expect(errors).toEqual([])
})

test('a pack needs a list, and lists of the same name cannot be put together', async ({ page }) => {
  await page.goto('/packs/create')
  await page.getByRole('textbox', { name: 'パック名', exact: false }).fill('Mix')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'パックにまとめる単語リストを1つ以上選んでください。' })).toBeVisible()
  await choice(page, 'Plain').check()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
})

test('a page with no list of one\'s own to put in a pack offers to make a list', async ({ page }) => {
  await page.addInitScript(([k, raw]) => localStorage.setItem(k, raw), [key, JSON.stringify({ ...workspace(), packs: [], lists: [] })])
  await page.goto('/packs/create')
  await expect(page.getByText('パックにまとめられる単語リストがありません。')).toBeVisible()
  await expect(page.getByRole('link', { name: '単語リストを作成', exact: true })).toHaveAttribute('href', '/create')
})

test('a pack needs a name that no other pack has', async ({ page }) => {
  await page.goto('/packs/create')
  await choice(page, '基本').check()
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
  await expect(page).toHaveURL(/:\d+\/edit\?pack=solo$/)
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
  // Screen readers hear the list's name, not its id.
  await expect(page.getByRole('status').filter({ hasText: '2件中1番目' })).toContainText('基本 を')
  // The sensor may not have measured the rows yet, so press again until the row below has moved up.
  await expect(async () => {
    await page.keyboard.press('ArrowDown', { delay: 100 })
    await expect(page.getByRole('group', { name: '応用' })).toHaveAttribute('style', /translate3d\(0px, -[1-9]/, { timeout: 2000 })
  }).toPass()
  await page.keyboard.press('Space')
  await expect(page.getByRole('status').filter({ hasText: '2件中2番目' })).toHaveText('基本 を2件中2番目に置きました。')
  await expect(page.getByRole('group').filter({ has: handles() }).first()).toHaveAccessibleName('応用')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/:\d+\/edit\?pack=shell$/)
  const workspace = await saved(page)
  expect(workspace.lists.map((item: { id: string }) => item.id)).toEqual(['adv', 'basic', 'apple', 'solo-list', 'plain'])
})

test('the lists of a pack are reordered with the menu of each row, and the order is saved', async ({ page }) => {
  await page.goto('/packs/edit?pack=shell')
  const rows = page.getByRole('group').filter({ has: page.getByRole('button', { name: /をドラッグして並べ替え/ }) })
  await expect(rows).toHaveCount(2)
  await page.getByRole('button', { name: '基本 の操作' }).click()
  await expect(page.getByRole('menuitem', { name: '上へ移動' })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('menuitem', { name: '先頭へ移動' })).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('menuitem', { name: '下へ移動' }).click()
  await expect(rows.nth(0)).toHaveAccessibleName('応用')
  await expect(rows.nth(1)).toHaveAccessibleName('基本')
  await expect(page.getByText('未保存の変更があります')).toBeVisible()
  await page.getByRole('button', { name: '基本 の操作' }).click()
  await expect(page.getByRole('menuitem', { name: '末尾へ移動' })).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('menuitem', { name: '先頭へ移動' }).click()
  await expect(rows.nth(0)).toHaveAccessibleName('基本')
  await expect(page.getByText('変更はありません')).toBeVisible()
  await page.getByRole('button', { name: '応用 の操作' }).click()
  await page.getByRole('menuitem', { name: '上へ移動' }).click()
  await expect(rows.nth(0)).toHaveAccessibleName('応用')
  await saveButton(page).click()
  await expect(page).toHaveURL(/:\d+\/edit\?pack=shell$/)
  const workspace = await saved(page)
  expect(workspace.lists.map((item: { id: string }) => item.id)).toEqual(['adv', 'basic', 'apple', 'solo-list', 'plain'])
})

test('the order follows lists added or deleted in another tab, and saves', async ({ page }) => {
  await page.goto('/packs/edit?pack=shell')
  const rows = page.getByRole('group').filter({ has: page.getByRole('button', { name: /をドラッグして並べ替え/ }) })
  await page.getByRole('button', { name: '応用 の操作' }).click()
  await page.getByRole('menuitem', { name: '先頭へ移動' }).click()
  await expect(rows.nth(0)).toHaveAccessibleName('応用')
  // Another tab deletes 基本 and adds 追加 to the pack; this tab reloads when it gets the focus.
  await page.evaluate(k => {
    const data = JSON.parse(localStorage.getItem(k)!)
    data.lists = data.lists.filter((item: { id: string }) => item.id !== 'basic')
    data.lists.push({ id: 'extra', packId: 'shell', name: '追加', createdAt: '2026-09-05', words: [{ display: 'pwd', input: 'pwd', annotation: '' }], records: [] })
    data.revision += 1
    localStorage.setItem(k, JSON.stringify(data))
    window.dispatchEvent(new Event('focus'))
  }, key)
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toHaveAccessibleName('応用')
  await expect(rows.nth(1)).toHaveAccessibleName('追加')
  await page.getByRole('button', { name: '追加 の操作' }).click()
  await page.getByRole('menuitem', { name: '先頭へ移動' }).click()
  await expect(rows.nth(0)).toHaveAccessibleName('追加')
  await saveButton(page).click()
  await expect(page).toHaveURL(/:\d+\/edit\?pack=shell$/)
  const workspace = await saved(page)
  expect(workspace.lists.map((item: { id: string }) => item.id)).toEqual(['extra', 'apple', 'solo-list', 'plain', 'adv'])
})

test('leaving the pack editor with changes asks first, and without changes does not', async ({ page }) => {
  await page.goto('/packs/edit?pack=shell')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page).toHaveURL(/:\d+\/edit\?pack=shell$/)
  await page.goto('/packs/edit?pack=shell')
  await page.getByRole('textbox', { name: 'パック名', exact: false }).fill('Shell!')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('保存していない変更があります')
  await dialog.getByRole('button', { name: '編集を続ける' }).click()
  await expect(page).toHaveURL(/\/packs\/edit/)
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await dialog.getByRole('button', { name: '破棄して移動' }).click()
  await expect(page).toHaveURL(/:\d+\/edit/)
  expect((await saved(page)).packs[0].name).toBe('Shell')
})

test('a pack that was deleted says so and links to the packs', async ({ page }) => {
  await page.goto('/packs/edit?pack=gone')
  await expect(page.getByText('このパックは削除されています')).toBeVisible()
  await page.locator('#main-content').getByRole('link', { name: '単語パック' }).click()
  await expect(page).toHaveURL(/\/edit$/)
})

const listName = (page: Page) => page.getByRole('textbox', { name: '単語リスト名', exact: true })
const firstWord = (page: Page) => page.getByRole('textbox', { name: '表示する単語 1', exact: true })
const packSelect = (page: Page) => page.getByRole('combobox', { name: 'パック', exact: true })
const saveButton = (page: Page) => page.getByRole('button', { name: '保存', exact: true })

test('a list made with 「リストを追加」 goes into that pack, which is opened afterwards', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/edit')
  await page.locator('li[data-pack-id="shell"]').getByRole('button', { name: 'Shell のパックの操作' }).click()
  await page.getByRole('menuitem', { name: 'リストを追加' }).click()
  await expect(page).toHaveURL(/\/create\?pack=shell$/)
  await expect(page.getByText('パック「Shell」に追加します。')).toBeVisible()
  await expect(packSelect(page)).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'カテゴリ（任意）' })).toHaveCount(0)
  await listName(page).fill('新規')
  await firstWord(page).fill('pwd')
  await saveButton(page).click()
  await expect(page).toHaveURL(/\/edit\?pack=shell$/)
  const shell = page.locator('li[data-pack-id="shell"]')
  await expect(shell.getByRole('button', { name: 'Shell', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(shell.locator('li[data-list-id] h3')).toHaveText(['基本', '応用', '新規'])
  expect((await saved(page)).lists.find((item: { name: string }) => item.name === '新規').packId).toBe('shell')
  expect(errors).toEqual([])
})

test('a list is made on its own, in a pack of its own named after the list', async ({ page }) => {
  await page.goto('/create')
  // No pack is chosen when making a list: packs are put together on /packs/create.
  await expect(packSelect(page)).toHaveCount(0)
  await expect(page.getByText(/に追加します/)).toHaveCount(0)
  await listName(page).fill('自分だけ')
  await firstWord(page).fill('x')
  await saveButton(page).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  const workspace = await saved(page)
  const made = workspace.lists.find((item: { name: string }) => item.name === '自分だけ')
  expect(workspace.packs.find((item: { id: string }) => item.id === made.packId)).toMatchObject({ name: '自分だけ' })
  await expect(page.locator(`li[data-pack-id="${made.packId}"]`).getByRole('button', { name: '自分だけ', exact: true })).toHaveAttribute('aria-expanded', 'true')
})

test('a list moved to another pack is shown there, and a pack left with no list goes', async ({ page }) => {
  await page.goto('/edit?list=solo-list')
  await expect(packSelect(page)).toHaveValue('solo')
  await expect(page.getByText('パック「単独」は削除されます。')).toHaveCount(0)
  await packSelect(page).selectOption({ label: 'Shell' })
  // 単独リスト is the only list of 単独, so moving it takes the pack away.
  await expect(page.getByText('パック「単独」は削除されます。')).toBeVisible()
  await saveButton(page).click()
  await expect(page.getByText('「単独リスト」を更新しました。')).toBeVisible()
  await expect(page.locator('li[data-pack-id="solo"]')).toHaveCount(0)
  const shell = page.locator('li[data-pack-id="shell"]')
  await expect(shell.getByRole('button', { name: 'Shell', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(shell.locator('li[data-list-id] h3')).toHaveText(['基本', '応用', '単独リスト'])
  const workspace = await saved(page)
  expect(workspace.packs.map((pack: { id: string }) => pack.id)).toEqual(['shell', 'fruits', 'plain-pack'])
  // The records move with the list.
  expect(workspace.lists.find((item: { id: string }) => item.id === 'solo-list')).toMatchObject({ packId: 'shell', records: [record] })
})

test('moving a list to a pack that has a list of that name is refused on the name field', async ({ page }) => {
  await page.goto('/edit?list=adv')
  await listName(page).fill('基本')
  await saveButton(page).click()
  await expect(page.getByText('同じ名前の単語リストがあります')).toBeVisible()
  await expect(listName(page)).toBeFocused()
  // The same name is fine in a pack that has none.
  await packSelect(page).selectOption({ label: 'Plain' })
  await expect(page.getByText('同じ名前の単語リストがあります')).toHaveCount(0)
  // Shell keeps 基本, so nothing is said about deleting it.
  await expect(page.getByText(/は削除されます/)).toHaveCount(0)
  await saveButton(page).click()
  await expect(page.getByText('「基本」を更新しました。')).toBeVisible()
  const workspace = await saved(page)
  expect(workspace.lists.find((item: { id: string }) => item.id === 'adv')).toMatchObject({ name: '基本', packId: 'plain-pack' })
})

test('one level is entered in one input, and chooses the list of a pack on the practice screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/edit?list=basic')
  const level = page.getByRole('textbox', { name: '難易度（任意）', exact: true })
  // A list has one level at most: one input, with no buttons to add or remove levels.
  await expect(page.getByRole('textbox', { name: /^難易度/ })).toHaveCount(1)
  await expect(page.getByRole('button', { name: /難易度/ })).toHaveCount(0)
  await expect(level).toHaveAccessibleDescription('練習画面で、パックの中のリストを選ぶのに使います。例：初級')
  await level.fill(' 初級 ')
  await saveButton(page).click()
  await expect(page.getByText('「基本」を更新しました。')).toBeVisible()
  expect((await saved(page)).lists.find((item: { id: string }) => item.id === 'basic').levels).toEqual(['初級'])

  await page.goto('/play?list=plain')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  await aside.getByRole('button', { name: /^Shell/ }).click()
  const levels = aside.getByRole('group', { name: 'Shell の難易度' })
  await levels.getByRole('button', { name: '初級', exact: true }).click()
  await expect(aside.getByRole('button', { name: /^Shell/ })).toContainText('初級 · 2語')
  await expect(page.locator('#wordDisplay')).toHaveText('ls')
})

test('editing a list leaves the category and tags of its pack as they are', async ({ page }) => {
  await page.goto('/edit?list=adv')
  await expect(page.getByRole('combobox', { name: 'カテゴリ（任意）' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'タグ（任意）' })).toHaveCount(0)
  await firstWord(page).fill('findx')
  await saveButton(page).click()
  await expect(page.getByText('「応用」を更新しました。')).toBeVisible()
  const workspace = await saved(page)
  expect(workspace.packs.find((item: { id: string }) => item.id === 'shell')).toMatchObject({ name: 'Shell', category: 'CLI', tags: ['unix'] })
  const adv = workspace.lists.find((item: { id: string }) => item.id === 'adv')
  expect(adv.words[0].display).toBe('findx')
  expect('category' in adv || 'tags' in adv || 'group' in adv).toBe(false)
})

test('a level is shown in its input when the list is edited again, and clearing it saves the list without one', async ({ page }) => {
  await page.goto('/edit?list=adv')
  const level = page.getByRole('textbox', { name: '難易度（任意）', exact: true })
  await level.fill('中級')
  await saveButton(page).click()
  await expect(page.getByText('「応用」を更新しました。')).toBeVisible()
  await page.goto('/edit?list=adv')
  await expect(level).toHaveValue('中級')
  await level.fill('')
  await saveButton(page).click()
  await expect(page.getByText('「応用」を更新しました。')).toBeVisible()
  expect((await saved(page)).lists.find((item: { id: string }) => item.id === 'adv')).not.toHaveProperty('levels')
})

// A pack with two lists that have levels and one that has not, and a pack of one list. The two levels of each list were
// saved by an app before v0.97.0, and are joined into one when read.
function levelsWorkspace() {
  return {
    version: 1, accountId: 'guest:local', revision: 1, devices: [],
    packs: [
      { id: 'study', name: 'Study', category: '学習', createdAt: '2026-09-01' },
      { id: 'single', name: '単独', createdAt: '2026-09-02' },
    ],
    lists: [
      { ...list('s-extra', 'study', '応用', ['extra']) },
      { ...list('s-1', 'study', '初級の中身', ['one']), levels: ['基本', '初級'] },
      { ...list('s-2', 'study', '上級の中身', ['two']), levels: ['基本', '上級'] },
      list('single-list', 'single', '単独リスト', ['solo', 'word']),
    ],
  }
}
const seedLevels = (page: Page) =>
  page.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [key, JSON.stringify(levelsWorkspace())])

test('the practice screen offers a choice for each pack, and a pack of one list is chosen by its list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=basic')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  await expect(aside.locator('li[data-pack-id]')).toHaveCount(4)
  await aside.locator('li[data-pack-id="solo"]').getByRole('button', { name: '単独リスト を選択' }).click()
  await expect(page.getByRole('button', { name: '単語リストを切り替える（現在: 単独リスト）' })).toBeVisible()
  await expect(page.locator('#wordDisplay')).toHaveText('one')
})

test('a pack opens to its lists with levels first and then the lists without, and a level chooses the list', async ({ page }) => {
  await seedLevels(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=single-list')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  const study = aside.locator('li[data-pack-id="study"]')
  await study.getByRole('button', { expanded: false }).click()
  // A list has one level, so the choices are one row without a step of their own.
  await expect(study.getByRole('group', { name: 'Study の難易度' }).getByRole('button')).toHaveText(['基本・初級', '基本・上級', '応用'])
  await expect(study).toContainText('難易度を選んでください。')
  await expect(study.getByRole('group', { name: /段目/ })).toHaveCount(0)
  await study.getByRole('button', { name: '基本・初級', exact: true }).click()
  await expect(page.getByRole('button', { name: '単語リストを切り替える（現在: Study › 基本・初級）' })).toBeVisible()
  await expect(page.locator('#wordDisplay')).toHaveText('one')
})

test('choosing a list of another pack while practising asks before stopping', async ({ page }) => {
  await seedLevels(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=single-list')
  await page.getByRole('textbox', { name: '表示された文字を入力', exact: true }).pressSequentially('s')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  const study = aside.locator('li[data-pack-id="study"]')
  await study.getByRole('button', { expanded: false }).click()
  await study.getByRole('button', { name: '応用', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('練習を中断しますか？')
  await page.getByRole('button', { name: '中断して切り替える' }).click()
  await expect(page.locator('#wordDisplay')).toHaveText('extra')
})

test('keeping on practising after choosing a list of another pack leaves none of its levels chosen', async ({ page }) => {
  await seedLevels(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=single-list')
  await page.getByRole('textbox', { name: '表示された文字を入力', exact: true }).pressSequentially('s')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  const study = aside.locator('li[data-pack-id="study"]')
  await study.getByRole('button', { expanded: false }).click()
  await study.getByRole('button', { name: '基本・初級', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('「単独リスト」の進捗（0 / 2 語）は記録されません。「Study › 基本・初級」に切り替えます。')
  await page.getByRole('button', { name: '練習を続ける' }).click()
  await expect(study.locator('[aria-pressed="true"]')).toHaveCount(0)
  await expect(study.getByRole('button', { name: '基本・初級', exact: true })).toBeVisible()
  await expect(page.locator('#wordDisplay')).toHaveText('solo')
})

test('a search by pack name leaves only that pack on the practice screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=basic')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  await aside.getByRole('searchbox').fill('果物')
  await expect(aside.locator('li[data-pack-id]')).toHaveCount(1)
  await expect(aside.locator('li[data-pack-id="fruits"]')).toBeVisible()
})

test('the words screen chooses from the same pack choices', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/words?list=basic')
  const aside = page.getByRole('complementary', { name: '単語リスト' })
  await expect(aside.locator('li[data-pack-id]')).toHaveCount(4)
  await aside.locator('li[data-pack-id="solo"]').getByRole('button', { name: '単独リスト を選択' }).click()
  await expect(page).toHaveURL(/\/words\?list=solo-list$/)
  await expect(page.getByRole('table', { name: '単独リスト' })).toBeVisible()
})

test('a list of a pack of several lists is named 「pack › list」 on the practice screen, a pack of one list by its list name', async ({ page }) => {
  await page.goto('/play?list=adv')
  await expect(page.getByRole('button', { name: /^単語リストを切り替える/ })).toContainText('Shell › 応用')
  await page.goto('/play?list=solo-list')
  const heading = page.getByRole('button', { name: /^単語リストを切り替える/ })
  await expect(heading).toContainText('単独リスト')
  await expect(heading).not.toContainText('›')
})

test('the words screen names the list once in its heading, and the line below only counts the words', async ({ page }) => {
  await page.goto('/words?list=adv')
  await expect(page.locator('#words-title')).toHaveText('Shell › 応用')
  await expect(page.locator('#words-title').locator('xpath=..').locator('p')).toHaveText('2語')
})

test('the home screen names the next lists 「pack › list」', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Shell › 応用 を練習する' })).toBeVisible()
  await expect(page.getByRole('region', { name: '次に練習するリスト', exact: true }).getByText('Shell › 応用')).toBeVisible()
})

test('a pack whose lists have no levels is chosen from by list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=solo-list')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  const shell = aside.locator('li[data-pack-id="shell"]')
  await expect(shell).toContainText('2リスト · リストを選ぶ')
  await expect(shell).not.toContainText('難易度')
  await shell.getByRole('button', { expanded: false }).click()
  const choices = shell.getByRole('group', { name: 'Shell のリスト' })
  await expect(choices.getByRole('button')).toHaveText(['基本', '応用'])
  await expect(shell).toContainText('リストを選んでください。')
  await expect(shell).not.toContainText('難易度')
})

test('a search that finds a list of a pack opens the pack and marks that list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play?list=solo-list')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  await aside.getByRole('searchbox').fill('応用')
  const shell = aside.locator('li[data-pack-id="shell"]')
  await expect(shell.getByRole('button', { name: /^Shell/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(shell.getByRole('button', { name: '応用', exact: true })).toBeVisible()
  await expect(shell.getByRole('button', { name: '応用', exact: true })).toHaveAccessibleDescription('検索に一致')
  await expect(shell.getByRole('button', { name: '基本', exact: true })).not.toHaveAttribute('data-match', /.*/)

  // A word finds its list in the same way on the words screen.
  await page.goto('/words?list=solo-list')
  const words = page.getByRole('complementary', { name: '単語リスト' })
  await words.getByRole('searchbox').fill('tar')
  const pack = words.locator('li[data-pack-id="shell"]')
  await expect(pack.getByRole('button', { name: /^Shell/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(pack.getByRole('button', { name: '応用', exact: true })).toHaveAccessibleDescription('検索に一致')
})

test('a level that would hide another list of the pack is refused under the level', async ({ page }) => {
  const message = '同じパックに、難易度（難易度がないリストは名前）が同じリストがあります'
  await page.goto('/edit?list=adv')
  const level = page.getByRole('textbox', { name: '難易度（任意）', exact: true })
  // basic has no level, so its name is what the practice screen picks it by.
  await level.fill('基本')
  await saveButton(page).click()
  await expect(page.getByRole('alert').filter({ hasText: message })).toHaveCount(1)
  await expect(level).toHaveAttribute('aria-invalid', 'true')
  await expect(level).toHaveAccessibleDescription(new RegExp(message))
  expect((await saved(page)).lists.find((item: { id: string }) => item.id === 'adv').levels).toBeUndefined()
  // Changing the level lets the message go, and a level no other list has is saved.
  await level.fill('応用')
  await expect(page.getByText(message)).toHaveCount(0)
  await expect(level).not.toHaveAttribute('aria-invalid', 'true')
  await saveButton(page).click()
  await expect(page.getByText('「応用」を更新しました。')).toBeVisible()
  expect((await saved(page)).lists.find((item: { id: string }) => item.id === 'adv').levels).toEqual(['応用'])
})

// The best-records screen groups the lists by pack and totals each pack's records.
const device = { id: 'mac', name: 'MacBook Air', layout: 'JIS' }
const onDevice = { ...record, device }

function seedRankings(page: Page) {
  const data = workspace()
  data.devices = [device] as never
  const basic = data.lists.find(item => item.id === 'basic')!
  basic.records = [onDevice, record]
  return page.evaluate(([k, raw]) => localStorage.setItem(k, raw), [key, JSON.stringify(data)])
}

test('the ranking list groups lists under a pack heading with its totals, and a pack of one list is a single row', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/rankings')
  const lists = page.getByRole('region', { name: '単語リスト', exact: true })
  const shell = lists.locator('li[data-pack-id="shell"]')
  await expect(shell.getByRole('heading', { name: 'Shell', exact: true })).toBeVisible()
  await expect(shell).toContainText('2回')
  await expect(shell).toContainText('練習済み 1/2')
  // The lists sit under the heading in saved order; the one without records looks like an unpractised row.
  await expect(shell.locator('[data-list-id]')).toHaveCount(2)
  await expect(shell.locator('[data-list-id]').first()).toContainText('基本')
  await expect(shell.locator('[data-list-id]').last()).toContainText('応用')
  // A pack of one list has no heading, only its row.
  await expect(lists.locator('li[data-pack-id]')).toHaveCount(1)
  await expect(lists.locator('[data-list-id="solo-list"]')).toContainText('単独リスト')
  // Packs without any record are listed once each in the "no records" group.
  await expect(lists.getByRole('heading', { name: 'まだ記録のないリスト（2）' })).toBeVisible()
  await expect(lists.locator('[data-list-id="apple"]')).toBeVisible()
  expect(errors).toEqual([])
})

test('a device filter totals only that device, and a pack name finds all its lists', async ({ page }) => {
  await page.goto('/rankings')
  await seedRankings(page)
  await page.goto('/rankings?device=mac')
  const lists = page.getByRole('region', { name: '単語リスト', exact: true })
  const shell = lists.locator('li[data-pack-id="shell"]')
  await expect(shell).toContainText('1回')
  await expect(shell).toContainText('練習済み 1/2')

  await page.goto('/rankings')
  // With a query typed, the clear button joins the label, so the name is not matched exactly.
  const search = lists.getByRole('searchbox')
  await search.fill('shell')
  await expect(lists.locator('li[data-pack-id="shell"] [data-list-id]')).toHaveCount(2)
  await expect(lists.locator('[data-list-id="solo-list"]')).toHaveCount(0)
  await search.fill('応用')
  await expect(lists.locator('li[data-pack-id="shell"] [data-list-id]')).toHaveCount(1)
  await expect(lists.locator('li[data-pack-id="shell"]').getByRole('heading', { name: 'Shell' })).toBeVisible()
})

test('a list opened by its URL shows its pack in the heading and the labels', async ({ page }) => {
  await page.goto('/rankings?list=basic')
  await expect(page.getByRole('heading', { level: 2, name: 'Shell › 基本', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Shell › 基本 の上位の記録', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '単語リスト', exact: true }).locator('[data-list-id="basic"]')).toHaveAttribute('aria-current', 'true')
})

// The records screen filters by pack and names lists 「pack › list」.
function seedRecords(page: Page) {
  const data = workspace()
  data.lists.find(item => item.id === 'adv')!.records = [record]
  return page.evaluate(([k, raw]) => localStorage.setItem(k, raw), [key, JSON.stringify(data)])
}
const recordRows = (page: Page) => page.locator('[data-record-key]')

test('the pack filter leaves the records of that pack and offers only its lists', async ({ page }) => {
  await page.goto('/records')
  await seedRecords(page)
  await page.goto('/records')
  await expect(recordRows(page)).toHaveCount(4)
  await page.getByRole('button', { name: /^パックで絞り込む/ }).click()
  // Only packs with records are offered.
  await expect(page.getByRole('menuitemradio')).toHaveCount(3)
  await page.getByRole('menuitemradio', { name: /^Shell/ }).click()
  await expect(page).toHaveURL(/\/records\?pack=shell$/)
  await expect(recordRows(page)).toHaveCount(3)
  await expect(recordRows(page).first().getByRole('heading')).toContainText('基本')
  await page.getByRole('button', { name: /^リストで絞り込む/ }).click()
  await expect(page.getByRole('menuitemradio')).toHaveCount(3)
  await expect(page.getByRole('menuitemradio', { name: /^単独リスト/ })).toHaveCount(0)
  await page.getByRole('menuitemradio', { name: /^応用/ }).click()
  await expect(page).toHaveURL(/pack=shell&list=adv$/)
  await expect(recordRows(page)).toHaveCount(1)
  // Another pack drops a list that is not in it.
  await page.getByRole('button', { name: /^パックで絞り込む/ }).click()
  await page.getByRole('menuitemradio', { name: /^単独/ }).click()
  await expect(page).toHaveURL(/\/records\?pack=solo$/)
  await expect(recordRows(page)).toHaveCount(1)
  // Clearing the pack keeps the chosen list.
  await page.getByRole('button', { name: /^リストで絞り込む/ }).click()
  await page.getByRole('menuitemradio', { name: /^単独リスト/ }).click()
  await page.getByRole('button', { name: /^パックで絞り込む/ }).click()
  await page.getByRole('menuitemradio', { name: /^すべてのパック/ }).click()
  await expect(page).toHaveURL(/\/records\?list=solo-list$/)
})

test('a record of a pack of several lists is named 「pack › list」, and ?list= alone selects no pack', async ({ page }) => {
  await page.goto('/records')
  await seedRecords(page)
  await page.goto('/records')
  await expect(recordRows(page).filter({ hasText: 'Shell › 基本' })).toHaveCount(2)
  await expect(recordRows(page).filter({ hasText: '単独リスト' }).getByRole('heading')).not.toContainText('›')
  await page.goto('/records?list=adv')
  await expect(recordRows(page)).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^パックで絞り込む（現在：すべてのパック）/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shell › 応用', exact: true })).toBeVisible()
})

test('a pack of several lists shows how many of its lists were practised, and a pack of one list does not', async ({ page }) => {
  await page.goto('/edit')
  await expect(page.locator('li[data-pack-id="shell"]').first()).toContainText('練習済み 1/2')
  await expect(page.locator('li[data-pack-id="fruits"]')).not.toContainText('練習済み')
  await expect(page.locator('li[data-pack-id="solo"]')).not.toContainText('練習済み')
})

test('the result of a practice and the best records name a list in a pack with its pack', async ({ page }) => {
  await page.goto('/play?list=adv')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await expect(page.getByRole('complementary').getByRole('heading', { name: 'ベスト記録' }).locator('..')).toContainText('Shell › 応用')
  await input.pressSequentially('find')
  await input.pressSequentially('tar')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習完了：Shell › 応用')
})

test('an unknown pack in the URL is no filter, and a list outside the chosen pack is dropped', async ({ page }) => {
  await page.goto('/records')
  await seedRecords(page)
  await page.goto('/records?pack=ghost')
  await expect(recordRows(page)).toHaveCount(4)
  await expect(page.getByRole('button', { name: /^パックで絞り込む/ })).toContainText('すべて')
  await page.goto('/records?pack=shell&list=solo-list')
  await expect(recordRows(page)).toHaveCount(3)
  await expect(page.getByRole('button', { name: /^パックで絞り込む/ })).toContainText('Shell')
  await expect(page.getByRole('button', { name: /^リストで絞り込む/ })).toContainText('すべて')
})

test('deleting the last record of the chosen pack keeps the pack in the filter with no rows', async ({ page }) => {
  await page.goto('/records')
  await seedRecords(page)
  await page.goto('/records?pack=solo')
  await expect(recordRows(page)).toHaveCount(1)
  await recordRows(page).first().getByRole('button', { name: /の記録を削除$/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click()
  await expect(recordRows(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/records\?pack=solo$/)
  await expect(page.getByRole('button', { name: /^パックで絞り込む/ })).toContainText('単独')
  await page.getByRole('button', { name: /^パックで絞り込む/ }).click()
  await expect(page.getByRole('menuitemradio', { name: /^単独/ })).toBeVisible()
})

test('a pack is duplicated right after the original, without records, and opened', async ({ page }) => {
  await page.goto('/edit')
  await page.locator('li[data-pack-id="shell"]').getByRole('button', { name: 'Shell のパックの操作' }).click()
  await page.getByRole('menuitem', { name: '複製' }).click()
  await expect(page.getByText('「Shell（コピー）」を作成しました。')).toBeVisible()
  const workspace = await saved(page)
  expect(workspace.packs.map((pack: { name: string }) => pack.name)).toEqual(['Shell', 'Shell（コピー）', '果物', '単独', 'Plain'])
  const copy = workspace.packs[1]
  expect(copy).toMatchObject({ category: 'CLI', tags: ['unix'] })
  expect(copy).not.toHaveProperty('origin')
  const lists = workspace.lists.filter((item: { packId: string }) => item.packId === copy.id)
  expect(lists.map((item: { name: string }) => item.name)).toEqual(['基本', '応用'])
  expect(lists.every((item: { records: unknown[] }) => item.records.length === 0)).toBe(true)
  const row = page.locator(`li[data-pack-id="${copy.id}"]`)
  await expect(row.getByRole('button', { name: 'Shell（コピー）', exact: true })).toHaveAttribute('aria-expanded', 'true')
})

test('a pack is exported as a file without records, and the file imports as a new pack', async ({ page }) => {
  await page.goto('/edit')
  await page.locator('li[data-pack-id="shell"]').getByRole('button', { name: 'Shell のパックの操作' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: '書き出す' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Shell.typle-pack.json')
  const path = await file.path()
  const text = (await import('node:fs')).readFileSync(path, 'utf8')
  const json = JSON.parse(text)
  expect(json.format).toBe('typle-pack')
  expect(json.lists.map((item: { name: string }) => item.name)).toEqual(['基本', '応用'])
  expect(json.lists[0].words.map((word: { input: string }) => word.input)).toEqual(['ls', 'cd'])
  expect(text).not.toContain('records')

  await page.locator('input[type="file"][accept*=".json"]').setInputFiles(path)
  await expect(page.locator('li[data-pack-id]', { hasText: 'Shell（2）' })).toBeVisible()
  const workspace = await saved(page)
  const imported = workspace.packs.at(-1)
  expect(imported).toMatchObject({ name: 'Shell（2）', category: 'CLI' })
  expect(workspace.lists.filter((item: { packId: string }) => item.packId === imported.id)).toHaveLength(2)
})

test('a broken file is refused with a message and nothing is added', async ({ page }) => {
  await page.goto('/edit')
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"nope"') })
  await expect(page.getByText('単語パックのファイルとして読み込めませんでした')).toBeVisible()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(4)
  expect((await saved(page)).packs).toHaveLength(4)
})

test('a pack file is imported from the empty state', async ({ page }) => {
  await page.addInitScript(k => localStorage.setItem(k, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 2, packs: [], lists: [], devices: [] })), key)
  await page.goto('/edit')
  await expect(page.getByRole('heading', { name: '単語パックはまだありません' })).toBeVisible()
  const file = { format: 'typle-pack', version: 1, pack: { name: '復元' }, lists: [{ name: '一', words: [{ display: 'a', input: 'a', annotation: '' }] }] }
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'p.typle-pack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.locator('li[data-pack-id]', { hasText: '復元' })).toBeVisible()
  const workspace = await saved(page)
  expect(workspace.packs.map((pack: { name: string }) => pack.name)).toEqual(['復元'])
  expect(workspace.lists).toHaveLength(1)
})

test('a file over 1 MiB is refused as too large and nothing is added', async ({ page }) => {
  await page.goto('/edit')
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(1024 * 1024 + 1, 32) })
  await expect(page.getByText('ファイルは1 MiB以内にしてください。')).toBeVisible()
  expect((await saved(page)).packs).toHaveLength(4)
})

test('a file that breaks a save rule is refused on the import line from the empty state, which stays', async ({ page }) => {
  await page.addInitScript(k => localStorage.setItem(k, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 2, packs: [], lists: [], devices: [] })), key)
  await page.goto('/edit')
  await expect(page.getByRole('heading', { name: '単語パックはまだありません' })).toBeVisible()
  const word = [{ display: 'a', input: 'a', annotation: '' }]
  const file = { format: 'typle-pack', version: 1, pack: { name: '重複' }, lists: [{ name: '同じ', words: word }, { name: '同じ', words: word }] }
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'dup.typle-pack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.getByText('同じ名前の単語リストがあります')).toBeVisible()
  await expect(page.getByRole('button', { name: '再読み込み' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '単語パックはまだありません' })).toBeVisible()
  await expect(page.locator('input[type="file"][accept*=".json"]')).toBeAttached()
  const workspace = await saved(page)
  expect(workspace.packs).toEqual([])
  expect(workspace.lists).toEqual([])
})

test('a file over a limit is refused with the message for limits and nothing is added', async ({ page }) => {
  await page.goto('/edit')
  const file = { format: 'typle-pack', version: 1, pack: { name: 'x'.repeat(201) }, lists: [{ name: '一', words: [{ display: 'a', input: 'a', annotation: '' }] }] }
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: 'long.typle-pack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.getByText('このファイルの中に、保存できる上限を超える項目があります')).toBeVisible()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(4)
  expect((await saved(page)).packs).toHaveLength(4)
})

// The catalog tests start from a guest with nothing saved: the official packs are followed from the catalog.
async function startFresh(page: Page) {
  await page.addInitScript(k => {
    if (sessionStorage.getItem('fresh')) return
    sessionStorage.setItem('fresh', '1')
    localStorage.removeItem(k)
  }, key)
}

test('the catalog shows every official pack as not followed for a guest with nothing saved', async ({ page }) => {
  await startFresh(page)
  await page.goto('/edit')
  await page.getByRole('link', { name: '公式パック', exact: true }).click()
  await expect(page).toHaveURL(/\/packs\/catalog$/)
  await expect(page.getByRole('heading', { name: '公式パック', level: 1 })).toBeVisible()
  const entries = page.locator('li[data-catalog-id]')
  expect(await entries.count()).toBeGreaterThan(0)
  await expect(entries.first()).toContainText('リスト')
  await expect(entries.first()).toContainText('語')
  for (const entry of await entries.all()) {
    await expect(entry.getByRole('button', { name: /^.* をフォローする$/ })).toBeEnabled()
    await expect(entry.getByRole('link', { name: /開く/ })).toHaveCount(0)
    await expect(entry.getByRole('button', { name: 'フォロー中' })).toHaveCount(0)
    await expect(entry.getByRole('button', { name: 'フォロー解除' })).toHaveCount(0)
  }
})

test('a followed official pack shows as following, opens on /edit, and is followed again after unfollowing', async ({ page }) => {
  await startFresh(page)
  await page.goto('/packs/catalog')
  const first = page.locator('li[data-catalog-id]').first()
  const name = (await first.getByRole('heading').innerText()).trim()
  await first.getByRole('button', { name: `${name} をフォローする`, exact: true }).click()
  await expect(page.getByText(`「${name}」をフォローしました`)).toBeVisible()
  await expect(page).toHaveURL(/\/packs\/catalog$/)
  await first.getByRole('link', { name: /開く/ }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  await expect(page.locator('li[data-pack-id]', { has: page.getByRole('button', { name, exact: true }) })).toBeVisible()

  await page.getByRole('link', { name: '公式パック', exact: true }).click()
  const entry = page.locator('li[data-catalog-id]', { has: page.getByRole('heading', { name, exact: true }) })
  await expect(entry.getByRole('button', { name: 'フォロー中' })).toBeDisabled()
  await expect(entry.getByRole('link', { name: /開く/ })).toBeVisible()
  await expect(entry.getByRole('button', { name: `${name} をフォローする`, exact: true })).toHaveCount(0)

  await entry.getByRole('button', { name: `${name} のフォローを解除`, exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'フォロー解除' }).click()
  await expect(page.getByText(`「${name}」のフォローを解除しました`)).toBeVisible()
  await expect(entry.getByRole('link', { name: /開く/ })).toHaveCount(0)
  await entry.getByRole('button', { name: `${name} をフォローする`, exact: true }).click()
  // The first notice may still be showing.
  await expect(page.getByText(`「${name}」をフォローしました`).last()).toBeVisible()
  await expect(entry.getByRole('link', { name: /開く/ })).toBeVisible()
})

test('an official pack followed next to a pack of the same name is numbered 「名前（2）」', async ({ page }) => {
  await startFresh(page)
  await page.goto('/packs/catalog')
  const name = (await page.locator('li[data-catalog-id]').first().getByRole('heading').innerText()).trim()

  // A pack of the user's own with that name is already there.
  await page.evaluate(([k, name]) => {
    const word = { display: 'a', input: 'a', annotation: '' }
    localStorage.setItem(k, JSON.stringify({
      version: 1, accountId: 'guest:local', revision: 1, devices: [],
      packs: [{ id: 'mine', name, createdAt: '2026-09-01' }],
      lists: [{ id: 'mine-list', packId: 'mine', name: '自作', createdAt: '2026-09-01', words: [word], records: [] }],
    }))
  }, [key, name])
  await page.reload()
  await page.locator('li[data-catalog-id]').first().getByRole('button', { name: `${name} をフォローする`, exact: true }).click()
  await page.locator('li[data-catalog-id]').first().getByRole('link', { name: /開く/ }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  await expect(page.getByRole('button', { name: `${name}（2）`, exact: true })).toBeVisible()
})
