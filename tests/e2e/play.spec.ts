import { test, expect } from '@playwright/test'
import { guestWorkspace } from './guestData'
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
    [key, guestWorkspace(lists, { devices })])
}

test('mid-practice switching asks first, Esc restarts and a lost focus can be resumed', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seedGuest(page)
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  const progress = page.getByRole('progressbar', { name: '単語の進捗' })
  await expect(input).toBeFocused()
  await page.getByRole('button', { name: '使用端末：デフォルト', exact: true }).click()
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
  await dialog.getByRole('searchbox', { name: 'リスト名・カテゴリ・タグで絞り込む' }).fill('second')
  await expect(dialog.getByRole('button', { name: /を選択/ })).toHaveCount(1)
  await dialog.getByRole('searchbox', { name: 'リスト名・カテゴリ・タグで絞り込む' }).fill('none')
  await expect(dialog).toContainText('一致するリストがありません。')
  await dialog.getByRole('searchbox', { name: 'リスト名・カテゴリ・タグで絞り込む' }).fill('Second')
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

test('the clock stops while the input has lost focus and runs again once it is back', async ({ page }) => {
  await seedGuest(page)
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  const elapsed = page.getByRole('definition').first()
  await expect(input).toBeFocused()
  await input.pressSequentially('a')
  await expect(elapsed).not.toHaveText('0:00.0')
  await input.blur()
  await expect(page.getByRole('button', { name: 'クリックまたは任意のキーで再開' })).toBeVisible()
  const paused = await elapsed.textContent()
  await page.waitForTimeout(2500)
  await expect(elapsed).toHaveText(paused!)
  await page.getByRole('button', { name: 'クリックまたは任意のキーで再開' }).click()
  await expect(input).toBeFocused()
  // Running again from where it stopped.
  await expect(elapsed).not.toHaveText(paused!)
  await input.pressSequentially('b')
  await input.pressSequentially('cd')
  await expect(page.getByLabel('練習結果', { exact: true })).toContainText('練習記録を保存しました。')
  const time = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).lists.find((list: { id: string }) => list.id === 'first').records[0].time, key)
  expect(time).toBeLessThan(2.5)
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
  await expect(page.getByRole('button', { name: 'すべての単語を表示' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('list', { name: 'すべての単語' }).locator('[aria-current="step"]')).toContainText(sentence)
})

test('all the words of a list are shown when it is chosen, to preview it', async ({ page }) => {
  await seedGuest(page)
  await page.goto('/play')
  const toggle = page.getByRole('button', { name: 'すべての単語を表示' })
  const all = page.getByRole('list', { name: 'すべての単語' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(all.getByRole('listitem')).toHaveText(['ab（入力中）', 'cd（未入力）'])
  await toggle.click()
  await expect(all).toHaveCount(0)
  // Choosing another list opens them again, with that list's words.
  await page.getByRole('button', { name: 'Second list を選択', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(all.getByRole('listitem')).toHaveText(['x（入力中）'])
  await expect(page.getByRole('textbox', { name: '表示された文字を入力', exact: true })).toBeFocused()
})

test('long paragraphs keep a readable size at every length while short words keep their large size', async ({ page }) => {
  const word = (text: string) => ({ display: text, input: text, annotation: '' })
  const texts = [sentence, `${sentence} ${sentence}`, `${sentence} ${sentence} ${sentence}`]
  const lists = [{ id: 'short', name: 'Short', createdAt: '2026-09-01', words: [word('ab')], records: [] },
    ...texts.map((text, index) => ({ id: `text-${index}`, name: `Text ${index + 1}`, createdAt: '2026-09-01', words: [word(text)], records: [] }))]
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
    [key, guestWorkspace(lists)])
  const display = page.locator('#wordDisplay')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/play')
  for (const [index, text] of texts.entries()) {
    await page.getByRole('button', { name: `Text ${index + 1} を選択`, exact: true }).click()
    await expect(display).toHaveText(text)
    await expect(display).toHaveCSS('font-size', '20px')
    await expect(display).toHaveCSS('line-height', '35px')
    await expect(display).toHaveCSS('text-align', 'center')
  }
  // Even the longest paragraph keeps the desktop size, then returns to the mobile size.
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(display).toHaveCSS('font-size', '26px')
  await expect(display).toHaveCSS('line-height', '45.5px')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(display).toHaveCSS('font-size', '20px')
  // Short words keep the large size.
  await page.getByRole('button', { name: 'Short を選択', exact: true }).click()
  await expect(display).toHaveText('ab')
  await expect(display).toHaveCSS('font-size', '44px')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(display).toHaveCSS('font-size', '64px')
})

test('with many lists the word to type stays on screen next to the input', async ({ page }) => {
  // The list of lists beside the practice card is taller than the screen; the card must not stretch to its height,
  // which put the word far above the input and out of view once the focused input scrolled into place.
  const word = (text: string) => ({ display: text, input: text, annotation: '' })
  const lists = Array.from({ length: 22 }, (_, index) => ({ id: `list-${index}`, name: `List ${index + 1}`, createdAt: '2026-09-01', words: [word(`word${index}`), word('end')], records: [] }))
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
    [key, guestWorkspace(lists)])
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size)
    await page.goto('/play')
    const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
    await expect(input).toBeFocused()
    await expect(page.locator('#wordDisplay')).toBeInViewport({ ratio: 1 })
    await expect(input).toBeInViewport({ ratio: 1 })
    const gap = (await input.boundingBox())!.y - (await page.locator('#wordDisplay').boundingBox())!.y
    expect(gap).toBeLessThan(300)
  }
})

test('the lists beside the practice card put recent ones first, scroll on their own and can be filtered', async ({ page }) => {
  const word = (text: string) => ({ display: text, input: text, annotation: '' })
  const lists = Array.from({ length: 22 }, (_, index) => ({ id: `list-${index}`, name: `List ${index + 1}`, createdAt: '2026-09-01', words: [word('ab')],
    records: index === 15 ? [{ id: 'r', time: 3, date: '2026-10-01T00:00:00Z', mistakes: 0, accuracy: 100, wordCount: 1 }] : [] }))
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
    [key, guestWorkspace(lists)])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/play')
  const aside = page.getByRole('complementary', { name: '単語リストとベスト記録' })
  const options = aside.getByRole('list', { name: '単語リスト', exact: true }).getByRole('button')
  await expect(options).toHaveCount(22)
  await expect(options.first()).toHaveAccessibleName('List 16 を選択')
  // The list of lists scrolls inside its card instead of making the page long.
  const box = options.first().locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")]')
  expect(await box.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(1200)
  const filter = aside.getByRole('searchbox', { name: '単語リストをリスト名・カテゴリ・タグで絞り込む' })
  await filter.fill('list 2')
  await expect(options).toHaveCount(4)
  await filter.fill('nothing')
  await expect(aside).toContainText('一致するリストがありません')
  await filter.fill('List 22')
  await options.first().click()
  await expect(page.getByRole('button', { name: /List 22/ }).first()).toBeVisible()
  await expect(filter).toHaveValue('')
  await expect(aside.getByRole('button', { name: 'List 22 を選択中' })).toBeInViewport()
})

test('the live stats can be hidden, the choice is remembered and the result still shows the numbers', async ({ page }) => {
  await seedGuest(page)
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  const stats = page.getByLabel('練習中の記録', { exact: true })
  const toggle = page.getByRole('button', { name: '練習中の記録を表示', exact: true })
  await expect(stats).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await input.pressSequentially('a')
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(stats).toHaveCount(0)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('a')

  await page.reload()
  await expect(page.getByRole('button', { name: '練習中の記録を表示', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(stats).toHaveCount(0)

  // Hidden stats are still timed and saved.
  await input.pressSequentially('abcd')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('正確率')
  await expect(result).toContainText('練習記録を保存しました。このリストの 1 位です。')

  await page.getByRole('button', { name: '練習中の記録を表示', exact: true }).click()
  await page.getByRole('button', { name: '最初からやり直す', exact: true }).click()
  await expect(stats).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('typle-r:live-stats'))).toBeNull()
})


test('practice text stays centered at 80% width and code previews keep compact chips after word changes', async ({ page }) => {
  const code = 'if true {\nfmt.Println("OK")\n}'
  const lists = [{ id: 'code', name: 'Code', createdAt: '2026-09-01', records: [], words: [
    { display: 'ab', input: 'ab', annotation: '', input_type: 'word' },
    { display: code, input: 'if true { fmt.Println("OK") }', annotation: '', input_type: 'code' },
    { display: 'end', input: 'end', annotation: '', input_type: 'word' },
  ] }]
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
    [key, guestWorkspace(lists)])
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/play')
    const display = page.locator('#wordDisplay')
    const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
    await expect(input).toBeFocused()
    const chip = page.locator('#all-words > li').nth(1)
    await expect(chip).toContainText('if true {  fmt.Println("OK")  }')
    expect(await chip.evaluate(element => element.textContent!.includes('\n'))).toBe(false)
    expect(await chip.evaluate(element => element.clientWidth < element.parentElement!.clientWidth)).toBe(true)
    await input.pressSequentially('ab')
    await expect(display).toHaveText('if true { fmt.Println("OK") }')
    await expect(display).toHaveCSS('text-align', 'center')
    await expect(display).toHaveCSS('scrollbar-width', 'none')
    const geometry = await display.evaluate(element => {
      const parent = element.parentElement!
      const style = getComputedStyle(parent)
      const contentWidth = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const box = element.getBoundingClientRect()
      const outer = parent.getBoundingClientRect()
      return { ratio: box.width / contentWidth, center: box.x + box.width / 2, parentCenter: outer.x + outer.width / 2 }
    })
    expect(geometry.ratio).toBeCloseTo(0.8, 2)
    expect(Math.abs(geometry.center - geometry.parentCenter)).toBeLessThan(1)
    expect(await display.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
})
