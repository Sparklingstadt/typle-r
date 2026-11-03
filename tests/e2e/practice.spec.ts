import { test, expect, type Page } from '@playwright/test'
import { openPacks } from './packRows'
import { guestWorkspace } from './guestData'
const key = 'typle-r:guest-workspace:v1'
async function importWords(page: import('@playwright/test').Page, files: Parameters<import('@playwright/test').Locator['setInputFiles']>[0]) {
  await page.getByRole('button', { name: 'CSV・TSVを読み込む', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'CSV・TSVから読み込む' })
  await dialog.getByLabel('CSV・TSVファイルを選択', { exact: true }).setInputFiles(files)
  await dialog.getByRole('button', { name: /語を追加$|語で置き換える$/ }).click()
  await expect(dialog).toHaveCount(0)
}
// Puts lists in this browser before the first page loads; later loads keep what the page saved.
function seed(page: Page, lists: unknown[]) {
  return page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, [key, guestWorkspace(lists)])
}
// The workspace this browser saved.
async function saved(page: Page) {
  return JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? 'null', key))
}
// Makes the next save to this browser fail once, as when its storage is full.
function failNextSave(page: Page) {
  return page.evaluate(key => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) { Storage.prototype.setItem = original; throw new DOMException('Full', 'QuotaExceededError') }
      return original.call(this, name, value)
    }
  }, key)
}

test('create, reorder, edit, play, reload and delete records', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/create')
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('E2E Practice')
  await page.getByRole('textbox', { name: '表示する単語 1', exact: true }).fill('First')
  await page.getByRole('textbox', { name: '入力する文字 1', exact: true }).fill('a')
  await page.getByRole('button', { name: '単語を追加', exact: true }).click()
  await page.getByRole('textbox', { name: '表示する単語 2', exact: true }).fill('Second')
  await page.getByRole('textbox', { name: '入力する文字 2', exact: true }).fill('b')
  await page.getByRole('button', { name: '単語 2 の操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '上へ移動', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('b')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  await page.reload()
  await openPacks(page)
  await page.getByRole('button', { name: 'E2E Practice を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Saved Practice')
  await page.getByRole('textbox', { name: '入力する文字 1', exact: true }).fill('c')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: 'Saved Practice を編集', exact: true }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Not saved')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '破棄して移動', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved Practice を編集', exact: true })).toBeVisible()
  await page.goto('/play')
  // The only list is already chosen.
  await expect(page.getByRole('button', { name: 'Saved Practice を選択中', exact: true })).toBeVisible()
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  // A wrong key is counted but leaves the position; the right key moves on without deleting anything.
  await input.pressSequentially('x')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveValue('')
  await input.pressSequentially('c')
  await expect(input).toHaveValue('')
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuetext', '2 / 2 語')
  await input.pressSequentially('a')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('練習記録を保存しました。')
  await expect(result).toContainText('ミス 1 文字')
  await expect(result).toContainText('66.67%')
  await expect(result.getByRole('button', { name: /もう一度/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuetext', '1 / 2 語')
  await page.goto('/records')
  await page.reload()
  await expect(page.getByRole('listitem').filter({ hasText: 'Saved Practice' })).toHaveCount(1)
  await page.getByRole('button', { name: /Saved Practice.*記録を削除/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Saved Practice' })).toHaveCount(1)
  await page.getByRole('button', { name: /Saved Practice.*記録を削除/ }).click()
  await failNextSave(page)
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('削除できませんでした')
  await page.screenshot({ path: 'test-results/shadcn-delete-dialog.png' })
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByText('まだ練習記録がありません', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByText('まだ練習記録がありません', { exact: false })).toBeVisible()
  await page.goto('/edit')
  await openPacks(page)
  await page.getByRole('button', { name: 'Saved Practice のその他の操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '削除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved Practice を編集', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Saved Practice を編集', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})


test('supporting pages, root redirect and GitHub link', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/Sparklingstadt/typle-r')
  for (const [path, title] of [['/guide', '使い方'], ['/about', 'Typleについて'], ['/rankings', 'ベスト記録']]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
})

test('IME commits advance once even with a duplicate input event', async ({ page }) => {
  await seed(page, [{
    id: 'ime', name: 'IME', createdAt: '2026-09-06', records: [],
    words: [{ display: 'あ', input: 'あ', annotation: '' }, { display: 'あ', input: 'あ', annotation: '' }],
  }])
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.dispatchEvent('compositionstart')
  await input.fill('あ')
  const progress = page.getByRole('progressbar', { name: '単語の進捗' })
  await expect(progress).toHaveAttribute('aria-valuetext', '1 / 2 語')
  await input.dispatchEvent('compositionend', { data: 'あ' })
  await expect(progress).toHaveAttribute('aria-valuetext', '2 / 2 語')
  await input.fill('あ')
  await expect(progress).toHaveAttribute('aria-valuetext', '2 / 2 語')
  await input.dispatchEvent('compositionstart')
  await input.fill('あ')
  await input.dispatchEvent('compositionend', { data: 'あ' })
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
})

test('failed record storage preserves result and can be retried', async ({ page }) => {
  await seed(page, [{ id: 'retry', name: 'Retry', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  await page.goto('/play')
  await failNextSave(page)
  await page.getByRole('textbox', { name: '表示された文字を入力', exact: true }).pressSequentially('a')
  await expect(page.getByLabel('練習結果', { exact: true }).getByRole('alert')).toContainText('記録を保存できませんでした。')
  await page.getByRole('button', { name: '記録の保存を再試行' }).click()
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  expect((await saved(page)).lists[0].records.length).toBe(1)
})


test('Tailwind editor remains accessible and fits mobile and desktop', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/create')
    const name = page.getByRole('textbox', { name: '単語リスト名', exact: true })
    await expect(name).toBeVisible()
    await expect(name).toHaveAttribute('required', '')
    await page.getByRole('button', { name: '単語 1 の操作', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '上へ移動', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(name).toBeFocused()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await name.fill('Keyboard test')
    await name.press('Enter')
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (width < 1280) await page.getByRole('button', { name: 'メニューを開く' }).click()
    await expect(page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'パックを作成', exact: true })).toHaveAttribute('href', '/packs/create')
    if (width < 1280) await page.keyboard.press('Escape')
    await page.screenshot({ path: `test-results/tailwind-editor-${width}.png`, fullPage: true })
  }
})

test('target text is coloured from the first mismatch, guides differing input and ignores IME composition', async ({ page }) => {
  await seed(page, [{ id: 'colors', name: 'Colors', createdAt: '2026-09-06', records: [], words: [
    { display: 'hoge', input: 'hoge', annotation: '' },
    { display: '表示', input: 'custom', annotation: 'ヒント' },
  ] }])
  await page.goto('/play')
  const states = page.locator('#wordDisplay [data-state]')
  const input = page.getByRole('textbox', { name: '表示された文字を入力' })
  const feedback = page.locator('#practice-feedback')
  await expect(page.locator('#wordDisplay')).toHaveText('hoge')
  await expect(page.getByRole('heading', { name: 'タイピング練習', exact: true })).toHaveCount(0)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  const stateList = () => states.evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.state))
  await expect.poll(stateList).toEqual(['current', 'pending', 'pending', 'pending'])
  await input.fill('hx')
  await expect.poll(stateList).toEqual(['done', 'current-error', 'pending', 'pending'])
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveValue('h')
  await expect(feedback).toHaveText('2文字目が違います。正しい文字を入力してください。')
  await input.fill('ho')
  await expect.poll(stateList).toEqual(['done', 'done', 'current', 'pending'])
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await input.fill('hoge')

  // Display and input differ: the display stays plain and the input guide is coloured instead.
  await expect(page.locator('#wordDisplay')).toHaveText('表示')
  await expect(page.locator('#wordDisplay [data-state]')).toHaveCount(0)
  const guide = page.locator('p:has(> [data-state])')
  await expect(guide).toHaveText('custom')
  await expect(page.getByText('ヒント', { exact: true })).toBeVisible()
  await input.fill('cu')
  await expect(guide.locator('[data-state="done"]')).toHaveCount(2)
  // Uncommitted IME text is shown in the input but not judged.
  await input.dispatchEvent('compositionstart')
  await input.fill('cuずt')
  await expect(input).toHaveValue('cuずt')
  await expect(guide.locator('[data-state="error"]')).toHaveCount(0)
  await expect(feedback).toHaveText('ずt変換中の文字は、確定してから判定します')
  await input.fill('cus')
  await input.dispatchEvent('compositionend', { data: 's' })
  await expect(guide.locator('[data-state="done"]')).toHaveCount(3)
})

test('optional word fields preserve overrides and annotations after saving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/create')
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Defaults')
  const display = page.getByRole('textbox', { name: '表示する単語 1', exact: true })
  await display.fill('hello')
  // An empty input uses the display; it is shown as a placeholder instead of a copied value.
  const input = page.getByRole('textbox', { name: '入力する文字 1', exact: true })
  await expect(input).toHaveValue('')
  await expect(input).toHaveAttribute('placeholder', 'hello')
  await display.fill('world')
  await expect(input).toHaveAttribute('placeholder', 'world')
  await input.fill('custom')
  await display.fill('表示')
  await expect(input).toHaveValue('custom')
  await page.getByRole('textbox', { name: '補足 1', exact: true }).fill('ヒント')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '単語を追加', exact: true }).click()
  await page.getByRole('textbox', { name: '表示する単語 2', exact: true }).fill('default')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  await page.reload()
  await openPacks(page)
  const workspace = await saved(page)
  expect(workspace.lists.find((list: { name: string }) => list.name === 'Defaults').words).toEqual([
    { display: '表示', input: 'custom', annotation: 'ヒント', input_type: 'word' },
    { display: 'default', input: 'default', annotation: '', input_type: 'word' },
  ])
  await page.getByRole('button', { name: 'Defaults を編集', exact: true }).click()
  await expect(input).toHaveValue('custom')
  await expect(page.getByRole('textbox', { name: '補足 1', exact: true })).toHaveValue('ヒント')
  await expect(page.getByRole('textbox', { name: '入力する文字 2', exact: true })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: '入力する文字 2', exact: true })).toHaveAttribute('placeholder', 'default')
})

test('mobile drawer closes by link, Esc and backdrop and returns focus to the menu button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/home')
  const open = page.getByRole('button', { name: 'メニューを開く' })
  const drawer = page.getByRole('dialog', { name: 'メニュー' })
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toHaveCount(0)
  expect((await page.getByRole('banner', { name: 'トップバー' }).boundingBox())?.height).toBe(56)
  expect((await page.getByRole('main').boundingBox())?.width).toBeGreaterThan(340)
  await expect(open).toHaveAttribute('aria-expanded', 'false')
  await open.click()
  await expect(drawer).toBeVisible()
  await expect(drawer).toContainText('このブラウザーに保存')
  await drawer.getByRole('link', { name: '単語パック', exact: true }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await expect(drawer).toBeHidden()
  await expect(open).toBeFocused()
  await open.click()
  await expect(drawer.getByRole('link', { name: '単語パック', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(open).toBeFocused()
  await open.click()
  // Wait for the reopened backdrop to be actionable before clicking outside the drawer.
  await page.locator('div.fixed.inset-0[data-state="open"]').click({ position: { x: 370, y: 420 } })
  await expect(drawer).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await open.click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(drawer).toBeHidden()
  await expect(open).toBeHidden()
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '単語パック', exact: true })).toBeVisible()
})

test('narrow desktop windows use the drawer so the page keeps its width', async ({ page }) => {
  // A laptop or a half-screen window: the 240px sidebar would squeeze the practice area, so it stays in the drawer until 1280px.
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto('/play')
  const open = page.getByRole('button', { name: 'メニューを開く' })
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toHaveCount(0)
  // With the sidebar out of the way the page starts at the left edge instead of 240px in.
  expect((await page.locator('#main-content').boundingBox())?.x).toBe(0)
  await open.click()
  const drawer = page.getByRole('dialog', { name: 'メニュー' })
  await expect(drawer.getByRole('link', { name: '練習する', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(drawer).toBeHidden()
  await expect(open).toBeHidden()
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '練習する', exact: true })).toBeVisible()
})

test('desktop sidebar fits 1280×768, stays in view while scrolling, and the skip link reaches the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 768 })
  await page.goto('/about')
  // The page is only as tall as the top bar plus its content, with no extra scroll below.
  expect(await page.evaluate(() => {
    const main = document.querySelector('#main-content > main')
    return main instanceof HTMLElement && document.documentElement.scrollHeight <= Math.max(innerHeight, 56 + main.offsetHeight)
  })).toBe(true)
  const storage = page.getByRole('region', { name: 'データの保存先', exact: true })
  await expect(storage.getByRole('heading', { name: 'このブラウザー', exact: true })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' })
  const help = page.getByRole('navigation', { name: 'ヘルプ' })
  await expect(navigation.getByRole('link', { name: '端末', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(help.getByRole('link', { name: 'GitHub', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(help.getByRole('link', { name: 'Typleについて', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('banner', { name: 'トップバー' })).toContainText('このブラウザーに保存')
  await page.goto('/guide')
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await expect(page.getByRole('banner', { name: 'トップバー' })).toBeInViewport()
  await expect(navigation.getByRole('link', { name: 'ホーム', exact: true })).toBeInViewport({ ratio: 1 })
  await page.goto('/records')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: '本文へスキップ' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.getElementById('main-content')?.contains(document.activeElement))).toBe(true)
})

test('best five records sort by accuracy then time and refresh after practice', async ({ page }) => {
  await seed(page, [
    { id: 'best', name: 'Best', createdAt: '2026-09-06', words: [{ display: 'a', input: 'a', annotation: 'ヒント' }, { display: 'b', input: 'b', annotation: '' }],
      records: [9, 3, 8, 5, 7, 1].map((time, index) => ({ id: `record-${index}`, time, date: '2026-09-06', accuracy: time === 1 ? 50 : 100, wordCount: 2 })) },
    { id: 'empty', name: 'Empty', createdAt: '2026-09-06', records: [], words: [{ display: 'x', input: 'x', annotation: '' }] },
  ])
  await page.goto('/play')
  const table = page.getByRole('table', { name: 'ベスト記録 上位5件', exact: true })
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(table.locator('tbody tr td:first-of-type')).toHaveText(['3.00 秒', '5.00 秒', '7.00 秒', '8.00 秒', '9.00 秒'])
  await expect(page.getByText('ヒント', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Empty を選択', exact: true }).click()
  await expect(table).toContainText('まだ記録がありません。')
  await page.getByRole('button', { name: 'Best を選択', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Best を選択中', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('a')
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuenow', '1')
  await expect(page.getByRole('button', { name: 'すべての単語を表示' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('list', { name: 'すべての単語' }).getByRole('listitem').first()).toContainText('（完了）')
  await input.pressSequentially('b')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('おつかれさまでした！')
  await expect(input).toHaveCount(0)
  await expect(result).toContainText('練習記録を保存しました。このリストの 1 位です。')
  await expect(result).toContainText('自己ベスト更新')
  await expect(table.getByRole('row').filter({ hasText: '今回の記録' })).toHaveCount(1)
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(table).not.toContainText('9.00 秒')
  await page.reload()
  await expect(table).not.toContainText('9.00 秒')
  await page.getByRole('link', { name: 'すべてのベスト記録', exact: true }).click()
  await expect(page).toHaveURL(/\/rankings\?list=best$/)
  const ranking = page.getByRole('table', { name: 'Best の上位の記録', exact: true })
  await expect(ranking.locator('tbody tr')).toHaveCount(5)
  await page.getByRole('button', { name: 'すべて表示（7件）', exact: true }).click()
  await expect(ranking.locator('tbody tr')).toHaveCount(7)
})

test('save and delete notifications stack and animate before being dismissed', async ({ page }) => {
  await seed(page, [{ id: 'toast', name: 'Toast', createdAt: '2026-09-06', records: [], words: [{ display: 'a', input: 'a', annotation: '' }] }])
  await page.goto('/edit')
  await openPacks(page)
  await page.getByRole('button', { name: 'Toast を編集', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const notifications = page.getByLabel('通知', { exact: true })
  const updated = notifications.getByRole('status').filter({ hasText: '更新しました' })
  await expect(updated).toBeVisible()
  await updated.hover()
  await page.getByRole('button', { name: 'Toast のその他の操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '削除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(notifications.getByRole('status')).toHaveCount(2)
  const deleted = notifications.getByRole('status').filter({ hasText: '削除しました' })
  await expect(deleted).toBeVisible()
  await updated.getByRole('button', { name: '通知を閉じる' }).click()
  await expect(updated).toHaveClass(/animate-out/)
  await expect(updated).toHaveCount(0)
  await expect(deleted).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(deleted).toHaveCount(0, { timeout: 8000 })
})

for (const format of ['csv', 'tsv'] as const) {
  test(`${format} import validates, previews, appends and persists words`, async ({ page }) => {
    await seed(page, [])
    await page.goto('/create')
    await page.getByRole('button', { name: 'CSV・TSVを読み込む', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'CSV・TSVから読み込む' })
    const file = dialog.getByLabel('CSV・TSVファイルを選択', { exact: true })
    await file.setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('input,display\na,') })
    await expect(dialog.getByRole('alert')).toContainText('input と display は必須')
    await expect(dialog.getByRole('button', { name: /語を追加$/ })).toHaveCount(0)
    const text = format === 'csv' ? 'input,display,annotation\r\nJapan,"日本,Japan","国名 ""country"""' : 'input\tdisplay\nJapan\t日本'
    await file.setInputFiles({ name: `Imported.${format}`, mimeType: 'text/plain', buffer: Buffer.from(text) })
    await expect(dialog.getByRole('table', { name: '読み込む単語のプレビュー' })).toContainText(format === 'csv' ? '日本,Japan' : '日本')
    await dialog.getByRole('button', { name: '1語を追加', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '1語を読み込みました' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('Imported')
    await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('Japan')
    await importWords(page, { name: 'more.tsv', mimeType: 'text/plain', buffer: Buffer.from('display\tinput\nフランス\tFrance') })
    await expect(page.getByRole('status').filter({ hasText: '1語を追加しました' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '入力する文字 2', exact: true })).toHaveValue('France')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/edit\?pack=/)
    await page.reload()
    await openPacks(page)
    await page.getByRole('button', { name: 'Imported を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue(format === 'csv' ? '日本,Japan' : '日本')
    await expect(page.getByRole('textbox', { name: '表示する単語 2', exact: true })).toHaveValue('フランス')
    await expect(page.getByRole('textbox', { name: '入力する文字 1', exact: true })).toHaveValue('Japan')
    await expect(page.getByRole('textbox', { name: '補足 1', exact: true })).toHaveValue(format === 'csv' ? '国名 "country"' : '')
  })
}

for (const theme of ['light', 'dark']) {
  test(`typing, annotations, editor and deletion dialog remain usable in ${theme} theme`, async ({ page }, testInfo) => {
    await seed(page, [{ id: 'theme', name: 'Theme practice', createdAt: '2026-09-27', records: [], words: [{ display: 'hello', input: 'hello', annotation: 'あいさつ' }] }])
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/play')
    await expect(page.getByRole('button', { name: 'ダークモード', exact: true })).toBeVisible()
    if (await page.getByRole('button', { name: 'ダークモード', exact: true }).getAttribute('aria-pressed') !== String(theme === 'dark')) {
      await page.getByRole('button', { name: 'ダークモード', exact: true }).click()
    }
    const display = page.locator('#wordDisplay')
    await expect(display).toHaveText('hello')
    const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
    await input.fill('hx')
    const colors = await page.evaluate(() => {
      const display = document.querySelector('#wordDisplay')!
      return {
        normal: getComputedStyle(display).color,
        correct: getComputedStyle(display.children[0]).color,
        incorrect: getComputedStyle(display.children[1]).color,
        annotation: getComputedStyle(display.previousElementSibling!).color,
      }
    })
    expect(colors.annotation).toBe(colors.normal)
    expect(colors.correct).not.toBe(colors.normal)
    expect(colors.incorrect).not.toBe(colors.correct)
    await page.screenshot({ path: testInfo.outputPath(`practice-${theme}.png`), fullPage: true })
    await input.fill('hello')
    await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
    await page.goto('/edit')
    await openPacks(page)
    await page.getByRole('button', { name: 'Theme practice を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('Theme practice')
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
    await page.getByRole('button', { name: 'Theme practice のその他の操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '削除', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`dialog-${theme}.png`), fullPage: true })
    await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click()
    await expect(page.getByRole('button', { name: 'ダークモード', exact: true })).toHaveAttribute('aria-pressed', String(theme === 'dark'))
  })
}

test('devices persist, are locked during practice, and survive rename and deletion in history', async ({ page }) => {
  await seed(page, [{ id: 'devices', name: 'Devices practice', createdAt: '2026-09-27', records: [{ time: 5, date: '2026-09-01' }], words: [{ display: 'ab', input: 'ab', annotation: '' }] }])
  await page.goto('/devices')
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '端末', exact: true })).toHaveAttribute('aria-current', 'page')
  // Where the data is saved shows once, in the top bar; the page's own badge is only for narrow screens.
  await expect(page.getByRole('banner', { name: 'トップバー' })).toContainText('このブラウザーに保存')
  await expect(page.getByRole('main').getByText('このブラウザーに保存', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: '端末を追加', exact: true }).click()
  const addDialog = page.getByRole('dialog', { name: '端末を追加' })
  await addDialog.getByRole('textbox', { name: '端末名', exact: true }).fill('MacBook')
  await addDialog.getByRole('textbox', { name: '配列・メモ（任意）', exact: true }).fill('JIS')
  await expect(addDialog.getByRole('checkbox', { name: 'このブラウザーで練習に使う端末にする' })).toBeChecked()
  await addDialog.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'MacBook', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'MacBook', exact: true })).toBeVisible()
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/devices-${width}.png`, fullPage: true })
  }
  const workspace = await saved(page)
  const device = workspace.devices[0]
  await page.goto('/play')
  // Adding the first device made it this browser's practice device.
  const deviceButton = page.getByRole('button', { name: '使用端末：MacBook（JIS）', exact: true })
  await expect(deviceButton).toBeEnabled()
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('a')
  await expect(deviceButton).toBeDisabled()
  // Another screen changes the registered name while this practice is underway.
  await page.evaluate(([key, value]) => localStorage.setItem(key, value),
    [key, JSON.stringify({ ...workspace, revision: workspace.revision + 1, devices: [{ ...device, name: 'Changed elsewhere' }] })])
  // The record is saved on its own, so the change made elsewhere neither refuses it nor is undone by it.
  await input.pressSequentially('b')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('MacBook（JIS）')
  await page.goto('/devices')
  const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Changed elsewhere', exact: true }) })
  await expect(row).toContainText('練習 1回 · 最終 今日')
  await row.getByRole('button', { name: 'Changed elsewhere を編集', exact: true }).click()
  const editDialog = page.getByRole('dialog', { name: '端末を編集' })
  await expect(editDialog).toContainText('これまでの練習記録（1回）には練習した時点の名前が残ります。')
  await editDialog.getByRole('textbox', { name: '端末名', exact: true }).fill('Renamed')
  await editDialog.getByRole('button', { name: '変更を保存', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Renamed', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Renamed を削除', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('この端末で練習した1回分の記録は削除されず')
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByRole('heading', { name: '端末はまだ登録されていません', exact: true })).toBeVisible()
  await page.goto('/records')
  await page.reload()
  // Records keep the device name from when they were practised, even after it is renamed and deleted.
  await expect(page.getByRole('listitem').filter({ hasText: 'MacBook（JIS）' })).toHaveCount(1)
  await expect(page.getByRole('listitem').filter({ hasText: '端末の記録なし' })).toHaveCount(1)
  await page.goto('/rankings?list=devices')
  // The deleted device keeps the name it had when practised, marked as deleted.
  const deviceCell = page.getByRole('table', { name: 'Devices practice の上位の記録', exact: true }).getByRole('cell').filter({ hasText: 'MacBook' })
  await expect(deviceCell).toHaveAttribute('title', 'MacBook（JIS）')
  await expect(deviceCell).toContainText('削除済み')
  await page.goto('/play')
  // Deleting the device in use goes back to the built-in default.
  await expect(page.getByRole('button', { name: '使用端末：デフォルト', exact: true })).toBeVisible()
})

test('CSV import preserves existing records and exact strings after a failed save and retry', async ({ page }) => {
  const existing = { id: 'csv-existing', name: 'Existing', createdAt: '2026-09-27', words: [{ display: 'Old', input: 'old', annotation: '' }], records: [{ date: '2026-09-27', time: 1 }] }
  await seed(page, [existing])
  await page.setViewportSize({ width: 390, height: 844 })
  // A name is only taken within its pack, so the list is added to the pack that has Existing (a pack's 「リストを追加」).
  await page.goto('/create?pack=pack-csv-existing')
  await importWords(page, { name: 'words.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeffdisplay,input,annotation\r\n" 字 ",zi,"意味,補足\r\n""引用"""\r\n字,zi,\r\n字,zi,') })
  await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue(' 字 ')
  // The seed is saved as the app saves it: the list in a pack of its own.
  expect((await saved(page)).lists).toEqual([{ ...existing, packId: `pack-${existing.id}` }])
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Existing')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '同じ名前' })).toBeVisible()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('CSV Chinese')
  await failNextSave(page)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  // The store fails with a message key; the screen shows its text in the reader's language.
  await expect(page.getByRole('alert').filter({ hasText: 'ブラウザーに保存できません。' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '単語リスト名', exact: true })).toHaveValue('CSV Chinese')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  await page.reload()
  await openPacks(page)
  await expect(page.getByRole('button', { name: 'CSV Chinese を編集', exact: true })).toBeVisible()
  const lists = (await saved(page)).lists
  expect(lists).toHaveLength(2)
  expect(lists[0]).toEqual({ ...existing, packId: `pack-${existing.id}` })
  expect(lists[1].words).toEqual([
    { display: ' 字 ', input: 'zi', annotation: '意味,補足\r\n"引用"', input_type: 'word' },
    { display: '字', input: 'zi', annotation: '', input_type: 'word' },
    { display: '字', input: 'zi', annotation: '', input_type: 'word' },
  ])
  expect(lists[1].records).toEqual([])
})

for (const width of [390, 1440]) {
  test(`word list CSV download and reimport preserve saved words at ${width}px`, async ({ page }, testInfo) => {
    const words = [
      { input: ' zi ', display: ' 字,日本 ', annotation: '意味\r\n"引用"' },
      { input: 'zi', display: '字', annotation: '' },
      { input: 'zi', display: '字', annotation: '' },
    ]
    const list = { id: 'export', name: '中国語', createdAt: '2026-09-27', words, records: [{ date: '2026-09-27', time: 1 }] }
    await seed(page, [list])
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/edit')
    await openPacks(page)
    const before = await saved(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '中国語 のその他の操作', exact: true }).click()
    await page.getByRole('menuitem', { name: 'CSVエクスポート', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('中国語.csv')
    expect(await download.failure()).toBeNull()
    const path = testInfo.outputPath(download.suggestedFilename())
    await download.saveAs(path)
    expect(await saved(page)).toEqual(before)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('export.png'), fullPage: true })
    await page.goto('/create')
    await importWords(page, path)
    await expect(page.getByRole('status').filter({ hasText: '3語を読み込みました' })).toBeVisible()
    await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('再取り込み')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/edit\?pack=/)
    const lists = (await saved(page)).lists
    expect(lists[0]).toEqual({ ...list, packId: `pack-${list.id}` })
    expect(lists[1].words).toEqual(words.map(word => ({ ...word, input_type: 'word' })))
    expect(lists[1].records).toEqual([])
  })
}
