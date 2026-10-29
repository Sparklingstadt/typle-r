import { test, expect } from '@playwright/test'
import { openPacks } from './packRows'
import { guestWorkspace } from './guestData'

test('removed server routes answer 404', async ({ page }) => {
  for (const path of ['/api/v1/lists', '/api/tokens']) {
    expect((await page.request.get(path)).status(), path).toBe(404)
  }
  // /shared/<id> is the public page of a shared pack again; an id that names no share says it has ended.
  await page.goto('/shared/0b1c')
  await expect(page.getByText('この共有は終了しました。')).toBeVisible()
  await expect(page.getByRole('banner', { name: 'トップバー' })).toBeVisible()
})

// authjs.session-token is what a browser that used the app before the Go backend still holds; typle-session=stale is an
// unreadable cookie of the current format. Neither signs anyone in.
for (const name of ['authjs.session-token', 'typle-session']) {
  test(`an unreadable ${name} cookie falls back to the data in this browser`, async ({ page, context }) => {
    await context.addCookies([{ name, value: 'stale', url: 'http://127.0.0.1:3101' }])
    const key = 'typle-r:guest-workspace:v1'
    const lists = [{ id: 'kept', name: 'Kept in browser', createdAt: '2026-10-19', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }]
    await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
      [key, guestWorkspace(lists)])
    await page.goto('/edit')
    await openPacks(page)
    await expect(page.getByRole('button', { name: 'Kept in browser を編集', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()
  })
}
