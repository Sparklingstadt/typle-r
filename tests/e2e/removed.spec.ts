import { test, expect } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'

test('removed server routes answer 404', async ({ page }) => {
  for (const path of ['/api/workspace', '/api/v1/lists', '/api/tokens', '/api/auth/session']) {
    expect((await page.request.get(path)).status(), path).toBe(404)
  }
  for (const path of ['/shared/0b1c', '/local-login']) {
    expect((await page.goto(path))?.status(), path).toBe(404)
    await expect(page.getByRole('banner', { name: 'トップバー' })).toBeVisible()
  }
})

test('a leftover session cookie is ignored', async ({ page, context }) => {
  await context.addCookies([{ name: 'authjs.session-token', value: 'stale', url: 'http://127.0.0.1:3101' }])
  const lists = [{ id: 'kept', name: 'Kept in browser', createdAt: '2026-10-18', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }]
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
    [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists, devices: [] })])
  await page.goto('/edit')
  await expect(page.getByRole('button', { name: 'Kept in browser を編集', exact: true })).toBeVisible()
})
