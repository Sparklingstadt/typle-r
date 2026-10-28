import { test, expect, type Locator } from '@playwright/test'

async function expectCaretInsideText(current: Locator) {
  const metrics = await current.evaluate(element => {
    const caret = getComputedStyle(element, '::after')
    const character = element.getBoundingClientRect()
    const region = element.parentElement!.getBoundingClientRect()
    const top = character.top + parseFloat(caret.top)
    return {
      width: parseFloat(caret.width), height: parseFloat(caret.height),
      top, bottom: top + parseFloat(caret.height), regionTop: region.top, regionBottom: region.bottom,
      opacity: parseFloat(caret.opacity), color: caret.backgroundColor,
    }
  })
  expect(metrics.width).toBeGreaterThan(0)
  expect(metrics.height).toBeGreaterThanOrEqual(3)
  expect(metrics.opacity).toBeGreaterThanOrEqual(0.49)
  expect(metrics.color).not.toBe('rgba(0, 0, 0, 0)')
  expect(metrics.top).toBeGreaterThanOrEqual(metrics.regionTop - 0.5)
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.regionBottom + 0.5)
}

for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
  test(`caret stays visible on letters, spaces and errors in ${theme} at ${width}px`, async ({ page }, testInfo) => {
    const examples = ['import', 'package main', 'import ( "fmt"; "errors" )']
    await page.addInitScript(texts => localStorage.setItem('typle-r:guest-workspace:v1', JSON.stringify({
      version: 1, accountId: 'guest:local', revision: 1, devices: [],
      lists: [{ id: 'caret', name: 'Caret', createdAt: '2026-10-28', records: [],
        words: texts.map(text => ({ display: text, input: text, annotation: '', input_type: 'code' })) }],
    })), examples)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/play')
    const themeToggle = page.getByRole('button', { name: 'ダークモード', exact: true })
    if (await themeToggle.getAttribute('aria-pressed') !== String(theme === 'dark')) await themeToggle.click()
    const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
    await input.focus()
    for (const [index, text] of examples.entries()) {
      const current = page.locator('#wordDisplay [data-state="current"]')
      await expect(current).toHaveText(text[0])
      await expectCaretInsideText(current)
      const typed = text.startsWith('package') ? 'package' : 'imp'
      await input.fill(typed)
      await expectCaretInsideText(current)
      // The screenshot's failing position is the space after "package".
      if (text.startsWith('package')) {
        await expect(current).toHaveText(' ')
        await page.screenshot({ path: testInfo.outputPath('caret-on-space.png'), fullPage: true })
      }
      await input.pressSequentially('#')
      const error = page.locator('#wordDisplay [data-state="current-error"]')
      await expect(error).toHaveCount(1)
      await expectCaretInsideText(error)
      await input.fill(text.slice(0, -1))
      await expectCaretInsideText(current)
      if (index < examples.length - 1) await input.fill(text)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
