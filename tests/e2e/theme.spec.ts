import { test, expect, type Page } from '@playwright/test'

const key = 'typle-r:theme:v1'
const control = (page: Page) => page.getByRole('combobox', { name: 'カラーテーマ' })
const expectTheme = async (page: Page, dark: boolean) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', /system|light|dark/)
  if (dark) await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  await expect(page.locator('html')).toHaveCSS('color-scheme', dark ? 'dark' : 'light')
}

test('OS defaults, manual choice, reload, navigation, focus and tab synchronization', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/guide')
  await expect(control(page)).toHaveValue('system')
  await expectTheme(page, true)
  await page.emulateMedia({ colorScheme: 'light' })
  await expectTheme(page, false)
  await control(page).selectOption('dark')
  await expectTheme(page, true)
  await page.reload()
  await expect(control(page)).toHaveValue('dark')
  await expectTheme(page, true)
  await page.getByRole('link', { name: 'Typle', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expectTheme(page, true)
  const other = await context.newPage()
  await other.emulateMedia({ colorScheme: 'dark' })
  await other.goto('/about')
  await expect(control(other)).toHaveValue('dark')
  await control(page).selectOption('light')
  await expectTheme(other, false)
  await expect(control(other)).toHaveValue('light')
  await control(page).selectOption('system')
  await expectTheme(page, false)
  await expectTheme(other, true)
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  await page.bringToFront()
  await control(page).focus()
  await expect(control(page)).toBeFocused()
  expect(errors).toEqual([])
})

test('theme is applied before hydration and invalid saved values fall back to system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.route('**/_next/static/**/*.js', route => route.abort())
  await page.goto('/guide', { waitUntil: 'domcontentloaded' })
  await expectTheme(page, true)
  await page.evaluate(key => localStorage.setItem(key, 'light'), key)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectTheme(page, false)
  await page.evaluate(key => localStorage.setItem(key, 'invalid'), key)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectTheme(page, true)
})

test('unavailable storage still allows switching', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } })
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/guide')
  await control(page).selectOption('dark')
  await expectTheme(page, true)
  await expect(page.getByRole('status')).toContainText('設定を保存できない')
  await control(page).selectOption('light')
  await expectTheme(page, false)
})

for (const width of [390, 1280]) {
  test(`both themes fit the navigation and pages at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/home')
    for (const theme of ['dark', 'light']) {
      await control(page).selectOption(theme)
      for (const path of ['/home', '/guide', '/about', '/play', '/create', '/records']) {
        await page.goto(path)
        await expectTheme(page, theme === 'dark')
        await expect(control(page)).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      await page.screenshot({ path: testInfo.outputPath(`${width}-${theme}.png`), fullPage: true })
    }
  })
}
