import { test, expect, type Page } from '@playwright/test'
import { guestWorkspace } from './guestData'
const key = 'typle-r:guest-workspace:v1'

const words = [
  { display: 'apple', input: 'apple', annotation: '' },
  { display: 'cat', input: 'cat', annotation: '' },
]

function seed(page: Page) {
  return page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, [key, guestWorkspace([{ id: 'fruits', name: 'Fruits', createdAt: '2026-11-01', words, records: [] }])])
}
const field = (page: Page) => page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
const caret = (page: Page) => field(page).evaluate(element => (element as HTMLInputElement).selectionStart)

// The field only ever grows at its end, so a click or tap on it must not leave the caret earlier in the text: a key
// typed there would turn the characters after it into new input, each judged (and missed) again.
test('a key typed after the field is clicked mid-word is judged once', async ({ page }) => {
  await seed(page)
  await page.goto('/play')
  await expect(page.getByRole('button', { name: 'Fruits を選択中', exact: true })).toBeVisible()
  await field(page).pressSequentially('ap')
  await field(page).evaluate(element => (element as HTMLInputElement).blur())
  await field(page).click({ force: true })
  await expect.poll(() => caret(page)).toBe(2)
  await page.keyboard.type('p')
  await expect(field(page)).toHaveValue('app')
  await expect(page.locator('main')).toContainText(/ミス\s*0/)
})
