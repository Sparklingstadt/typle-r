import { test, expect, type Page } from '@playwright/test'
import { deleteWorkspace, newAccountId, signIn } from './account'

async function choose(page: Page) {
  await page.goto('/home')
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '関心', exact: true }).click()
  await expect(page).toHaveURL(/\/interests$/)
  await expect(page.getByRole('heading', { name: '関心', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: '中国語', exact: true })).toHaveCount(0)
  const language = page.getByRole('button', { name: '語学', exact: true })
  await expect(language).toHaveAttribute('aria-pressed', 'false')
  await language.click()
  await expect(language).toHaveAttribute('aria-pressed', 'true')
  const chinese = page.getByRole('button', { name: '中国語', exact: true })
  await chinese.click()
  await expect(chinese).toHaveAttribute('aria-pressed', 'true')
  return { language, chinese }
}

async function expectSelectionKept(page: Page) {
  await page.reload()
  await expect(page.getByRole('button', { name: '語学', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '中国語', exact: true })).toHaveAttribute('aria-pressed', 'true')
}

test('a guest picks interests, they survive a reload and split the catalog', async ({ page }) => {
  const { language } = await choose(page)
  await expectSelectionKept(page)

  await page.goto('/packs/catalog')
  const matching = page.getByRole('region', { name: '関心に合うパック' })
  const others = page.getByRole('region', { name: 'そのほかのパック' })
  await expect(matching.getByRole('heading', { name: '国名：中国語・国連加盟国（小文字）', exact: true })).toHaveCount(1)
  await expect(matching.getByRole('heading', { name: 'Go構文', exact: true })).toHaveCount(0)
  await expect(others.getByRole('heading', { name: 'Go構文', exact: true })).toHaveCount(1)
  await page.getByRole('link', { name: '関心を変える', exact: true }).click()
  await expect(page).toHaveURL(/\/interests$/)

  await language.click()
  await expect(language).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: '中国語', exact: true })).toHaveCount(0)
  await page.goto('/packs/catalog')
  await expect(page.getByRole('region', { name: '関心に合うパック' })).toHaveCount(0)
})

test('with no interests the catalog is not split', async ({ page }) => {
  await page.goto('/packs/catalog')
  await expect(page.locator('li[data-catalog-id]').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'そのほかのパック' })).toHaveCount(0)
})

test('an account keeps its interests after a reload', async ({ page, context }) => {
  const accountId = newAccountId()
  await signIn(context, accountId)
  try {
    await choose(page)
    await expectSelectionKept(page)
    const response = await page.request.get('/api/workspace')
    expect((await response.json()).interests).toEqual(['language', 'language/zh'])
  } finally {
    await deleteWorkspace(accountId)
  }
})
