import { test, expect, type Locator, type Page } from '@playwright/test'
import { guestWorkspace } from './guestData'

const key = 'typle-r:guest-workspace:v1'
const sentence = 'The quick brown fox jumps over the lazy dog and keeps running across the field'
const paragraph = `${sentence} ${sentence} ${sentence} ${sentence}`
type Word = { display: string; input: string; annotation: string; input_type?: string }

function seedWords(page: Page, words: Word[], otherWords?: Word[]) {
  return page.addInitScript(([storageKey, value]) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value)
  }, [key, guestWorkspace([
      { id: 'paragraphs', name: 'Paragraphs', createdAt: '2026-09-01', words, records: [] },
      ...(otherWords ? [{ id: 'other', name: 'Other paragraphs', createdAt: '2026-09-01', words: otherWords, records: [] }] : []),
    ])])
}

// Inspect the actual scrolling region, whether it is the paragraph or its containing element.
function paragraphState(paragraph: Locator) {
  return paragraph.evaluate(element => {
    let region: HTMLElement | null = element as HTMLElement
    while (region && !['auto', 'scroll'].includes(getComputedStyle(region).overflowY)) region = region.parentElement
    if (!region) throw new Error('The paragraph needs its own vertical scrolling region')
    const bounds = region.getBoundingClientRect()
    const caret = element.querySelector('[data-state="current"], [data-state="current-error"]')?.getBoundingClientRect()
    return {
      scrollTop: region.scrollTop,
      height: region.clientHeight,
      contentHeight: region.scrollHeight,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      overflowsHorizontally: region.scrollWidth > region.clientWidth,
      caretVisible: !!caret && caret.top >= bounds.top - 1 && caret.bottom <= bounds.bottom + 1,
    }
  })
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('long paragraphs follow the current character, corrections, restart and the next identical word', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const word = { display: paragraph, input: paragraph, annotation: '' }
  // The second word deliberately has the same text: advancing must still reset its scroll position.
  await seedWords(page, [word, word])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/play')
  const display = page.locator('#wordDisplay')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await expect(input).toBeFocused()
  await expect(display).toHaveText(paragraph)
  const initial = await paragraphState(display)
  expect(initial.contentHeight).toBeGreaterThan(initial.height)
  expect(initial.height).toBeLessThanOrEqual(initial.lineHeight * 5 + 8)
  expect(initial.scrollTop).toBe(0)
  expect(initial.caretVisible).toBe(true)
  const pageScroll = await page.evaluate(() => scrollY)

  await input.pressSequentially(paragraph.slice(0, -8))
  await expect.poll(async () => (await paragraphState(display)).scrollTop).toBeGreaterThan(0)
  await expect.poll(async () => (await paragraphState(display)).caretVisible).toBe(true)
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll)
  await expect(input).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath('multiline-mobile.png'), fullPage: true })

  // The cursor remains visible after a wrong key and after typing the right character.
  await input.pressSequentially('!')
  await expect(display.locator('[data-state="current-error"]')).toHaveCount(1)
  await expect.poll(async () => (await paragraphState(display)).caretVisible).toBe(true)
  await input.pressSequentially(paragraph.slice(-8, -7))
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await expect(display.locator('[data-state="current-error"]')).toHaveCount(0)

  await input.fill(paragraph.slice(0, -1))
  await expect.poll(async () => (await paragraphState(display)).scrollTop).toBeGreaterThan(0)
  await input.press('Escape')
  await expect(input).toHaveValue('')
  await expect.poll(async () => (await paragraphState(display)).scrollTop).toBe(0)

  await input.fill(paragraph.slice(0, -1))
  await input.pressSequentially(paragraph.slice(-1))
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuenow', '1')
  await expect(input).toHaveValue('')
  await expect.poll(async () => (await paragraphState(display)).scrollTop).toBe(0)
  await expect.poll(async () => (await paragraphState(display)).caretVisible).toBe(true)
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll)
  await expectNoPageOverflow(page)
  expect(errors).toEqual([])
})

test('a long input guide uses the same readable layout when the displayed text differs', async ({ page }) => {
  const description = '長い文章でも文字を小さくせず、入力する場所を見ながら練習できます。'.repeat(8)
  const word = { display: description, input: paragraph, annotation: '' }
  await seedWords(page, [word, word], [word])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/play')
  const display = page.locator('#wordDisplay')
  const target = page.locator('#wordTarget')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await expect(input).toBeFocused()
  await expect(display).toHaveText(description)
  await expect(target).toHaveText(paragraph)
  for (const text of [display, target]) {
    await expect(text).toHaveCSS('font-size', '20px')
    await expect(text).toHaveCSS('line-height', '35px')
    await expect(text).toHaveCSS('text-align', 'center')
    const state = await paragraphState(text)
    expect(state.contentHeight).toBeGreaterThan(state.height)
    expect(state.height).toBeLessThanOrEqual(state.lineHeight * 5 + 8)
    expect(state.overflowsHorizontally).toBe(false)
  }
  const pageScroll = await page.evaluate(() => scrollY)
  await input.pressSequentially(paragraph.slice(0, -8))
  await expect.poll(async () => (await paragraphState(target)).scrollTop).toBeGreaterThan(0)
  await expect.poll(async () => (await paragraphState(target)).caretVisible).toBe(true)
  expect((await paragraphState(display)).scrollTop).toBe(0)
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll)
  await expect(input).toBeInViewport({ ratio: 1 })
  await expectNoPageOverflow(page)

  // Plain display text has no active character to reset its scroll position. It must still
  // return to the beginning on restart, the next identical word and a different list.
  async function scrollDescription() {
    await display.hover()
    await page.mouse.wheel(0, 1000)
    await expect.poll(async () => (await paragraphState(display)).scrollTop).toBeGreaterThan(0)
    await expect.poll(async () => {
      const state = await paragraphState(display)
      return state.scrollTop + state.height >= state.contentHeight - 1
    }).toBe(true)
  }
  await scrollDescription()
  await input.press('Escape')
  await expect(input).toHaveValue('')
  await expect.poll(async () => (await paragraphState(display)).scrollTop).toBe(0)

  await scrollDescription()
  await input.fill(paragraph)
  await expect(page.getByRole('progressbar', { name: '単語の進捗' })).toHaveAttribute('aria-valuenow', '1')
  await expect.poll(async () => (await paragraphState(display)).scrollTop).toBe(0)

  await scrollDescription()
  await page.getByRole('button', { name: 'Other paragraphs を選択', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '中断して切り替える' }).click()
  await expect(page.getByRole('button', { name: '単語リストを切り替える（現在: Other paragraphs）' })).toBeVisible()
  await expect(display).toHaveText(description)
  await expect.poll(async () => (await paragraphState(display)).scrollTop).toBe(0)
})

test('an unbroken long word stays inside the card and the active character remains visible on a short screen', async ({ page }) => {
  const text = 'abcdefghijklmnopqrstuvwxyz'.repeat(12)
  await seedWords(page, [{ display: text, input: text, annotation: '' }])
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/play')
  const display = page.locator('#wordDisplay')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await expect(input).toBeFocused()
  await expect(display).toHaveCSS('font-size', '20px')
  await input.fill(text.slice(0, -1))
  await expect.poll(async () => (await paragraphState(display)).caretVisible).toBe(true)
  const state = await paragraphState(display)
  expect(state.scrollTop).toBeGreaterThan(0)
  expect(state.overflowsHorizontally).toBe(false)
  await expect(input).toBeInViewport({ ratio: 1 })
  await expectNoPageOverflow(page)
})

test('code shows only the characters to type, not its formatted display as well', async ({ page }) => {
  const code = { display: 'import (\n  "fmt";\n  "errors"\n)', input: 'import ( "fmt"; "errors" )', annotation: '', input_type: 'code' }
  await seedWords(page, [code])
  await page.goto('/play')
  const display = page.locator('#wordDisplay')
  await expect(display).toHaveText(code.input)
  await expect(page.locator('#wordTarget')).toHaveCount(0)
  await expect(page.getByText('入力する文字', { exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: '表示された文字を入力', exact: true }).pressSequentially('import')
  await expect(display.locator('[data-state="current"]')).toHaveText(' ')
})
