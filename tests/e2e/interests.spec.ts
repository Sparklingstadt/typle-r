import { test, expect, type Page } from '@playwright/test'
import { deleteWorkspace, newAccountId, signIn } from './account'

// Since v0.101.1 every interest is picked until some are saved. Unpicks both parents, which unpicks every chip.
async function clearInterests(page: Page) {
  for (const name of ['語学', 'プログラミング']) {
    const chip = page.getByRole('button', { name, exact: true })
    await expect(chip).toBeEnabled()
    if (await chip.getAttribute('aria-pressed') === 'true') await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  }
}

async function choose(page: Page) {
  await page.goto('/home')
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '関心', exact: true }).click()
  await expect(page).toHaveURL(/\/interests$/)
  await expect(page.getByRole('heading', { name: '関心', level: 1 })).toBeVisible()
  await clearInterests(page)
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

test('every interest is picked at first, so every official pack is listed and matches', async ({ page }) => {
  await page.goto('/interests')
  for (const name of ['語学', 'プログラミング', '中国語', 'Go', 'Node.js', 'シェル', 'クラウド']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  const section = page.getByRole('region', { name: '関心に合う公式パック' })
  await expect(section.locator('li[data-catalog-id]')).toHaveCount(35)
  for (const toggle of await section.getByRole('switch').all()) await expect(toggle).not.toBeChecked()
  await page.goto('/packs/catalog')
  await expect(page.getByRole('region', { name: '関心に合うパック' }).locator('li[data-catalog-id]')).toHaveCount(35)
  await expect(page.getByRole('region', { name: 'そのほかのパック' })).toHaveCount(0)
})

test('with no interests the catalog is not split', async ({ page }) => {
  await page.goto('/interests')
  await clearInterests(page)
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

test('the interests screen lists the fitting official packs with switches, and 追加 follows those switched on', async ({ page }) => {
  await page.goto('/interests')
  await clearInterests(page)
  await expect(page.getByText('関心を選ぶと、合う公式パックがここに並びます。')).toBeVisible()
  await page.getByRole('button', { name: '語学', exact: true }).click()
  const section = page.getByRole('region', { name: '関心に合う公式パック' })
  const name = '国名：中国語・国連加盟国（小文字）'
  const row = section.locator('li[data-catalog-id]', { has: page.getByRole('heading', { name, exact: true }) })
  // Each pack shows its name, its lists and its word count, with its switch off. 語学 has the country list in levels
  // and whole.
  await expect(section.locator('li[data-catalog-id]')).toHaveCount(8)
  await expect(section.getByRole('heading', { name: '国名：中国語・国連加盟193か国（小文字）', exact: true })).toBeVisible()
  await expect(row).toContainText('国名：中国語・国連加盟国（小文字・初級1）')
  await expect(row).toContainText('193語')
  const toggle = row.getByRole('switch', { name: `${name} をフォローする` })
  await expect(toggle).not.toBeChecked()
  const add = page.getByRole('button', { name: '追加', exact: true })
  await expect(add).toBeDisabled()

  // プログラミング adds its packs; a switch left off is not followed.
  await page.getByRole('button', { name: 'プログラミング', exact: true }).click()
  await expect(section.getByRole('heading', { name: 'Go構文（2）', exact: true })).toBeVisible()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await add.click()
  await expect(page.getByText('1個のパックをフォローしました。')).toBeVisible()
  await expect(toggle).toBeChecked()
  await expect(add).toBeDisabled()
  await page.goto('/edit')
  await expect(page.locator('li[data-pack-id]')).toHaveCount(1)
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()

  // Switching a followed pack off and adding unfollows it, after asking.
  await page.goto('/interests')
  await expect(toggle).toBeChecked()
  await toggle.click()
  await add.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText(`「${name}」のフォローを解除します。これらのパックの記録も消えます。`)).toBeVisible()
  await dialog.getByRole('button', { name: '追加', exact: true }).click()
  await expect(page.getByText('1個のパックのフォローを解除しました。')).toBeVisible()
  await expect(toggle).not.toBeChecked()
  await page.goto('/edit')
  await expect(page.locator('li[data-pack-id]')).toHaveCount(0)
})
