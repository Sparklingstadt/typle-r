import { test, expect, type Page } from '@playwright/test'

// The radio is visually hidden inside its label card, so pick a language by clicking the card.
const choose = (page: Page, name: string) => page.locator('label').filter({ has: page.locator(`span[lang]`, { hasText: name }) }).click()

test('the display language switches the whole screen at once and is remembered', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/home')
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '一般' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { level: 1, name: '一般' })).toBeVisible()
  const languages = page.getByRole('group', { name: '表示言語' })
  await expect(languages.getByRole('radio')).toHaveCount(6)
  await expect(languages.getByRole('radio', { name: /日本語/ })).toBeChecked()

  await choose(page, 'English')
  await expect(page.getByRole('heading', { level: 1, name: 'General' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('The display language is now English.')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Practice history' })).toBeVisible()
  // Changing the language re-renders <html>; the theme class added before the first paint must survive it.
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page).toHaveTitle('General | Typle')

  await page.reload()
  await expect(page.getByRole('group', { name: 'Display language' }).getByRole('radio', { name: /English/ })).toBeChecked()
  await page.goto('/devices')
  await expect(page.getByRole('heading', { level: 1, name: 'Devices' })).toBeVisible()

  for (const [name, heading, lang] of [['简体中文', '通用', 'zh-CN'], ['繁體中文', '一般', 'zh-TW'], ['Русский', 'Общие', 'ru'], ['Français', 'Général', 'fr']]) {
    await page.goto('/settings')
    await choose(page, name)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
  }

  await choose(page, '日本語')
  await expect(page.getByRole('heading', { level: 1, name: '一般' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  expect(errors).toEqual([])
})
