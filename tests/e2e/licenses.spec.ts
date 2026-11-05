import { test, expect } from '@playwright/test'

test('the licenses page lists the shipped software and links the full texts', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('link', { name: 'オープンソースのライセンス', exact: true }).click()
  await expect(page).toHaveURL(/\/about\/licenses$/)
  await expect(page.getByRole('heading', { name: 'オープンソースのライセンス', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /^onnxruntime-web/ })).toBeVisible()
  await page.getByRole('searchbox', { name: '名前・ライセンスで絞り込み' }).fill('Noto Sans')
  await expect(page.getByText(/件中 1件$/)).toBeVisible()
  await expect(page.getByRole('link', { name: /^Noto Sans JP/ })).toBeVisible()
  const text = await page.request.get('/licenses/third-party.txt')
  expect(text.ok()).toBe(true)
  expect(await text.text()).toContain('Copyright (c) Microsoft Corporation')
})
