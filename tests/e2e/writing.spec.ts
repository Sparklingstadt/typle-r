import { test, expect, type Page } from '@playwright/test'
import { guestWorkspace } from './guestData'

const key = 'typle-r:guest-workspace:v1'
const marked = {
  id: 'hand', name: 'Hand', createdAt: '2026-11-02', records: [], writing: { language: 'en' },
  words: [{ display: 'cat', input: 'cat', annotation: '' }, { display: 'dog', input: 'dog', annotation: '' }],
}
const plain = {
  id: 'plain', name: 'Plain', createdAt: '2026-11-02', records: [],
  words: [{ display: 'a', input: 'a', annotation: '' }],
}

// Puts a list marked for writing and one without the mark in this browser before the first page loads.
function seed(page: Page) {
  return page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, [key, guestWorkspace([marked, plain])])
}

const field = (page: Page) => page.getByRole('textbox', { name: 'ここに手書きで入力', exact: true })
const progress = (page: Page) => page.getByRole('progressbar', { name: '単語の進捗' })
const model = (page: Page) => page.locator('#wordDisplay')

async function startWriting(page: Page) {
  await seed(page)
  await page.goto('/play?list=hand')
  await page.getByRole('radio', { name: 'Handwriting', exact: true }).click()
  await expect(field(page)).toBeVisible()
  await expect(field(page)).toHaveAttribute('lang', 'en')
  await expect(model(page)).toHaveText('cat')
}

test('correct word advances', async ({ page }) => {
  await startWriting(page)
  await field(page).fill('cat')
  await expect(field(page)).toHaveValue('')
  await expect(model(page)).toHaveText('dog')
  await expect(progress(page)).toHaveAttribute('aria-valuetext', '2 / 2 語')
})

test('wrong word counts a mistake on Enter', async ({ page }) => {
  await startWriting(page)
  await field(page).fill('  cot ')
  await expect(field(page)).toHaveValue('  cot ')
  await field(page).press('Enter')
  await expect(page.getByText('「cot」と読めました', { exact: true })).toBeVisible()
  await expect(field(page)).toHaveValue('  cot ')
  await field(page).fill('cat')
  await expect(model(page)).toHaveText('dog')
  await field(page).fill('dog')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('Handwriting')
  await expect(result).toContainText('66.67%')
  await expect(result).toContainText('練習記録を保存しました。')
})

test('empty Enter is not a mistake', async ({ page }) => {
  await startWriting(page)
  await field(page).fill('   ')
  await field(page).press('Enter')
  await page.getByRole('button', { name: '判定', exact: true }).click()
  await expect(page.getByText(/と読めました/)).toHaveCount(0)
  await field(page).fill('cat')
  await field(page).fill('dog')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('100%')
})

test('skip counts a mistake', async ({ page }) => {
  await startWriting(page)
  await page.getByRole('button', { name: '飛ばす', exact: true }).click()
  await expect(model(page)).toHaveText('dog')
  await expect(field(page)).toHaveValue('')
  await field(page).fill('dog')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('50%')
  // Handwriting counts words, not characters or keys.
  await expect(result).toContainText('ミス 1 語')
  await expect(result).toContainText('語/分')
  await expect(result).not.toContainText('打/分')
})

test('composition is not judged', async ({ page }) => {
  await startWriting(page)
  await field(page).dispatchEvent('compositionstart')
  await field(page).fill('cat')
  await expect(progress(page)).toHaveAttribute('aria-valuetext', '1 / 2 語')
  await field(page).press('Enter')
  await expect(page.getByText(/と読めました/)).toHaveCount(0)
  await field(page).dispatchEvent('compositionend', { data: 'cat' })
  await expect(progress(page)).toHaveAttribute('aria-valuetext', '2 / 2 語')
  await expect(field(page)).toHaveValue('')
  await field(page).fill('dog')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('100%')
})

test('writing records are separate', async ({ page }) => {
  await startWriting(page)
  await field(page).fill('cat')
  await field(page).fill('dog')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  const records = JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? 'null', key)).lists[0].records
  expect(records).toHaveLength(1)
  expect(records[0].mode).toBe('writing')

  await page.goto('/records')
  await expect(page.locator('[data-record-key]')).toHaveCount(1)
  await expect(page.locator('[data-record-key]')).toContainText('Handwriting')

  await page.goto('/rankings?list=hand')
  await expect(page.getByRole('radio', { name: '通常', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('heading', { name: 'まだ練習していません', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'Handwriting', exact: true }).click()
  await expect(page).toHaveURL(/mode=writing/)
  await expect(page.getByRole('heading', { name: 'まだ練習していません', exact: true })).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'Hand の上位の記録', exact: true }).or(page.getByRole('list', { name: 'Hand の上位の記録', exact: true })).first()).toBeVisible()
})

test('unflagged list hides the switch', async ({ page }) => {
  await startWriting(page)
  await page.getByRole('button', { name: 'Plain を選択', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Handwriting', exact: true })).toHaveCount(0)
  await expect(field(page)).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '表示された文字を入力', exact: true })).toBeFocused()
  // The stored choice comes back with a marked list.
  await page.getByRole('button', { name: 'Hand を選択', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Handwriting', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(field(page)).toBeVisible()
})

test('Safari IME Enter after compositionend is not judged', async ({ page }) => {
  await startWriting(page)
  await field(page).dispatchEvent('compositionstart')
  await field(page).fill('ca')
  await field(page).dispatchEvent('compositionend', { data: 'ca' })
  // Safari sends the confirming Enter after compositionend, with isComposing false and keyCode 229.
  await field(page).evaluate(element => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'keyCode', { get: () => 229 })
    element.dispatchEvent(event)
  })
  await expect(page.getByText(/と読めました/)).toHaveCount(0)
  await expect(field(page)).toHaveValue('ca')
  await field(page).fill('cat')
  await field(page).fill('dog')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('100%')
})

test('switching the mode mid-run asks first, and cancelling keeps the run', async ({ page }) => {
  await startWriting(page)
  await field(page).fill('cat')
  await expect(progress(page)).toHaveAttribute('aria-valuetext', '2 / 2 語')
  await page.getByRole('radio', { name: 'タイピング', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('「タイピング」に切り替えます。')
  await dialog.getByRole('button', { name: '練習を続ける', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Handwriting', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(model(page)).toHaveText('dog')
  await expect(progress(page)).toHaveAttribute('aria-valuetext', '2 / 2 語')

  await page.getByRole('radio', { name: 'タイピング', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '中断して切り替える', exact: true }).click()
  await expect(field(page)).toHaveCount(0)
  await expect(progress(page)).toHaveAttribute('aria-valuetext', '1 / 2 語')
  // The typing input is focused once it is there again.
  await expect(page.getByRole('textbox', { name: '表示された文字を入力', exact: true })).toBeFocused()
})

test('handwriting hides the recall switch and is never saved as recall', async ({ page }) => {
  await seed(page)
  await page.goto('/play?list=hand')
  const recall = page.getByRole('button', { name: '思い出して打つ', exact: true })
  await recall.click()
  await expect(recall).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('radio', { name: 'Handwriting', exact: true }).click()
  await expect(recall).toHaveCount(0)
  await field(page).fill('cat')
  await field(page).fill('dog')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  const records = JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? 'null', key)).lists[0].records
  expect(records.map((record: { mode?: string }) => record.mode)).toEqual(['writing'])
  // Back to typing, the recall choice applies again.
  await page.getByRole('radio', { name: 'タイピング', exact: true }).click()
  await expect(page.getByRole('button', { name: '思い出して打つ', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
