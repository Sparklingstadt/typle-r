import { test, expect } from '@playwright/test'
import { deleteWorkspace, newAccountId, origin, signIn, withDatabase } from './account'

let accountId = ''
test.beforeEach(() => { accountId = newAccountId() })
test.afterEach(async () => {
  await deleteWorkspace(accountId)
  await withDatabase(pool => pool.query('DELETE FROM typle_session_revocations WHERE owner_id = $1', [accountId]))
})

test('signing out of every device signs out the other browsers too', async ({ browser }) => {
  const here = await browser.newContext()
  const elsewhere = await browser.newContext()
  try {
    await signIn(here, accountId)
    await signIn(elsewhere, accountId)
    const other = await elsewhere.newPage()
    expect((await other.request.get('/api/workspace')).status()).toBe(200)

    const page = await here.newPage()
    await page.goto('/settings')
    const section = page.getByRole('region', { name: 'ログイン中の端末' })
    await section.getByRole('button', { name: 'すべての端末からログアウト' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'すべての端末からログアウトしますか？' })
    await dialog.getByRole('button', { name: 'ログアウトする' }).click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()

    // The other browser still holds its cookie, but it no longer reaches the account's data, and the cookie is removed.
    const refused = await other.request.get('/api/workspace')
    expect(refused.status()).toBe(401)
    expect(await refused.json()).toEqual({ error: 'loginRequired' })
    const cookies = await elsewhere.cookies(origin)
    expect(cookies.find(cookie => cookie.name === 'typle-session')).toBeUndefined()

    // A new login is let in. Its time is in whole seconds and one in the second of the revocation counts as revoked,
    // so it is made in the next second.
    await new Promise(resolve => setTimeout(resolve, 1100))
    await signIn(elsewhere, accountId)
    expect((await other.request.get('/api/workspace')).status()).toBe(200)
  } finally {
    await here.close()
    await elsewhere.close()
  }
})

test('the section is only for a signed-in account', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1, name: '一般' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'ログイン中の端末' })).toHaveCount(0)
})

test('a failed sign-out of every device keeps the user signed in and says so', async ({ context, page }) => {
  await signIn(context, accountId)
  await page.route('**/api/auth/signout?everywhere=1', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"databaseUnavailable"}' }))
  await page.goto('/settings')
  await page.getByRole('button', { name: 'すべての端末からログアウト' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'ログアウトする' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('ログアウトできませんでした。もう一度お試しください。')
  await expect(page).toHaveURL(/\/settings$/)
  expect((await page.request.get('/api/workspace')).status()).toBe(200)
})
