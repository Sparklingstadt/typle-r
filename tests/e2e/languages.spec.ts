import { test, expect } from '@playwright/test'

test('a guest can follow all six beginner language packs and keeps them after reloading', async ({ page }) => {
  const languages = ['韓国語', 'フランス語', 'チェコ語', 'ドイツ語', 'スペイン語', '中国語']
  await page.goto('/packs/catalog')
  for (const language of languages) {
    const name = `${language}：基礎単語・基礎構文`
    const entry = page.locator('li[data-catalog-id]', { has: page.getByRole('heading', { name, exact: true }) })
    await expect(entry).toContainText('80語')
    await entry.getByRole('button', { name: `${name} をフォローする`, exact: true }).click()
    await expect(entry.getByRole('button', { name: 'フォロー中', exact: true })).toBeDisabled()
  }
  await page.goto('/edit')
  await page.reload()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(6)
  for (const language of languages) {
    await expect(page.getByRole('button', { name: `${language}：基礎単語・基礎構文`, exact: true })).toBeVisible()
  }
})

test('Czech can be selected as an interest and shows its beginner pack', async ({ page }) => {
  await page.goto('/interests')
  const language = page.getByRole('button', { name: '語学', exact: true })
  await expect(language).toHaveAttribute('aria-pressed', 'true')
  await language.click()
  await expect(language).toHaveAttribute('aria-pressed', 'false')
  await language.click()
  await expect(language).toHaveAttribute('aria-pressed', 'true')
  const czech = page.getByRole('button', { name: 'チェコ語', exact: true })
  await expect(czech).toHaveAttribute('aria-pressed', 'false')
  await czech.click()
  await expect(czech).toHaveAttribute('aria-pressed', 'true')
  await expect(czech).toBeEnabled()
  await page.reload()
  await expect(czech).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/packs/catalog')
  const matching = page.getByRole('region', { name: '関心に合うパック' })
  await expect(matching.getByRole('heading', { name: 'チェコ語：基礎単語・基礎構文', exact: true })).toBeVisible()
  await expect(matching.getByRole('heading', { name: 'フランス語：基礎単語・基礎構文', exact: true })).toHaveCount(0)
})
