import { test, expect } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const sentence = 'The quick brown fox jumps over the lazy dog and keeps running across the field'

function seedGuest(page: import('@playwright/test').Page) {
  const word = (text: string) => ({ display: text, input: text, annotation: '' })
  const lists = [
    { id: 'first', name: 'First list', createdAt: '2026-09-01', words: [word('ab'), word('cd')], records: [] },
    { id: 'second', name: 'Second list', createdAt: '2026-09-01', words: [word('x')], records: [] },
    { id: 'long', name: 'Long sentence', createdAt: '2026-09-01', words: [word(sentence), word('end')], records: [] },
  ]
  const devices = [{ id: 'mac', name: 'Mac', layout: 'JIS' }]
  return page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
    [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists, devices })])
}

test('mid-practice switching asks first, Esc restarts and a lost focus can be resumed', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seedGuest(page)
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  const progress = page.getByRole('progressbar', { name: '単語の進捗' })
  await expect(input).toBeFocused()
  await page.getByRole('button', { name: '使用端末：未選択', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Mac（JIS）', exact: true }).click()
  await expect(input).toBeFocused()

  await input.pressSequentially('a')
  await expect(page.getByRole('button', { name: '使用端末：Mac（JIS）', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Second list を選択', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '練習を中断しますか？' })
  await expect(confirm).toContainText('「First list」の進捗（0 / 2 語）は記録されません。「Second list」に切り替えます。')
  await expect(confirm.getByRole('button', { name: '練習を続ける' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('a')

  // Esc in the input starts the same list again.
  await input.press('Escape')
  await expect(input).toHaveValue('')
  await expect(progress).toHaveAttribute('aria-valuetext', '1 / 2 語')
  await expect(page.getByRole('button', { name: '使用端末：Mac（JIS）', exact: true })).toBeEnabled()

  // Losing focus shows a resume prompt; a key press returns to the input without typing into it.
  await input.pressSequentially('a')
  await input.blur()
  const resume = page.getByRole('button', { name: 'クリックまたは任意のキーで再開' })
  await expect(resume).toBeVisible()
  await page.keyboard.press('z')
  await expect(input).toBeFocused()
  await expect(resume).toHaveCount(0)
  await expect(input).toHaveValue('a')

  await page.getByRole('button', { name: 'Second list を選択', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '中断して切り替える' }).click()
  await expect(page.getByRole('button', { name: '単語リストを切り替える（現在: Second list）' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Second list を選択中', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('')
  expect(errors).toEqual([])
})

test('the list picker filters lists and the result screen offers the next step', async ({ page }) => {
  await seedGuest(page)
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await page.getByRole('button', { name: '単語リストを切り替える（現在: First list）' }).click()
  const dialog = page.getByRole('dialog', { name: '単語リストを選ぶ' })
  await dialog.getByRole('searchbox', { name: 'リスト名で絞り込む' }).fill('second')
  await expect(dialog.getByRole('button', { name: /を選択/ })).toHaveCount(1)
  await dialog.getByRole('searchbox', { name: 'リスト名で絞り込む' }).fill('none')
  await expect(dialog).toContainText('一致するリストがありません。')
  await dialog.getByRole('searchbox', { name: 'リスト名で絞り込む' }).fill('Second')
  await dialog.getByRole('button', { name: 'Second list を選択', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(input).toBeFocused()

  await input.pressSequentially('x')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('このリストの最初の記録')
  await expect(result).toContainText('練習記録を保存しました。このリストの 1 位です。')
  const other = result.getByRole('button', { name: '別のリストを選ぶ' })
  await other.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(other).toBeFocused()
  await expect(result.getByRole('link', { name: '記録を見る' })).toHaveAttribute('href', '/records')
})

test('long text keeps its spaces and wraps inside the practice card at 390px', async ({ page }) => {
  await seedGuest(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/play')
  await page.getByRole('button', { name: 'Long sentence を選択', exact: true }).click()
  const display = page.locator('#wordDisplay')
  await expect(display).toHaveText(sentence)
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('The quick')
  await expect(display.locator('[data-state="done"]')).toHaveCount(9)
  await expect(display.locator('[data-state="current"]')).toHaveText(' ')
  const box = await display.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(await display.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // The input stays above a typical on-screen keyboard.
  expect((await input.boundingBox())!.y + 56).toBeLessThan(844 - 291)
  await page.getByRole('button', { name: 'すべての単語を表示' }).click()
  await expect(page.getByRole('list', { name: 'すべての単語' }).locator('[aria-current="step"]')).toContainText(sentence)
})
