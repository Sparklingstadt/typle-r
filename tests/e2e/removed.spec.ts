import { test, expect } from '@playwright/test'

test('removed server routes answer 404', async ({ page }) => {
  for (const path of ['/api/v1/lists', '/api/tokens']) {
    expect((await page.request.get(path)).status(), path).toBe(404)
  }
  expect((await page.goto('/shared/0b1c'))?.status()).toBe(404)
  await expect(page.getByRole('banner', { name: 'トップバー' })).toBeVisible()
})
