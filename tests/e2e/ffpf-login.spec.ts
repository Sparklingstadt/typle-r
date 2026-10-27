import { test, expect, type Page } from '@playwright/test'

// The session answer is replaced, so these tests need no cookie: what the screen offers follows `providers`.
async function answer(page: Page, body: unknown) {
  await page.route('**/api/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }))
}
// The sign-in route is served by the Go backend; the navigation is stopped here so that the test sees where it goes.
async function captureSignIn(page: Page) {
  const urls: string[] = []
  await page.route('**/api/auth/signin?**', route => { urls.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }) })
  return urls
}

test.describe('login method', () => {


  test('GitHub only: one GitHub button, as before', async ({ page }) => {
    await answer(page, { user: null, providers: ['github'] })
    const urls = await captureSignIn(page)
    await page.goto('/home')
    await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログイン方法を選ぶ' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'FFPF IDでログイン' })).toHaveCount(0)
    await page.getByRole('button', { name: 'GitHubでログイン' }).click()
    await expect.poll(() => urls.length).toBe(1)
    const url = new URL(urls[0])
    expect(url.pathname).toBe('/api/auth/signin')
    expect(url.searchParams.get('returnTo')).toBe('/home')
    expect(url.searchParams.has('provider')).toBe(false)
  })

  test('both: a menu offers GitHub and FFPF ID, and FFPF ID goes to provider=ffpf', async ({ page }) => {
    await answer(page, { user: null, providers: ['github', 'ffpf'] })
    const urls = await captureSignIn(page)
    await page.goto('/home')
    await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toHaveCount(0)
    await page.getByRole('button', { name: 'ログイン方法を選ぶ' }).click()
    await expect(page.getByRole('menuitem')).toHaveText(['GitHubでログイン', 'FFPF IDでログイン'])
    await page.getByRole('menuitem', { name: 'FFPF IDでログイン' }).click()
    await expect.poll(() => urls.length).toBe(1)
    const url = new URL(urls[0])
    expect(url.pathname).toBe('/api/auth/signin')
    expect(url.searchParams.get('returnTo')).toBe('/home')
    expect(url.searchParams.get('provider')).toBe('ffpf')
  })

  test('both: GitHub in the menu has no provider', async ({ page }) => {
    await answer(page, { user: null, providers: ['github', 'ffpf'] })
    const urls = await captureSignIn(page)
    await page.goto('/home')
    await page.getByRole('button', { name: 'ログイン方法を選ぶ' }).click()
    await page.getByRole('menuitem', { name: 'GitHubでログイン' }).click()
    await expect.poll(() => urls.length).toBe(1)
    expect(new URL(urls[0]).searchParams.has('provider')).toBe(false)
  })

  test('FFPF ID only: one FFPF ID button', async ({ page }) => {
    await answer(page, { user: null, providers: ['ffpf'] })
    const urls = await captureSignIn(page)
    await page.goto('/home')
    await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'ログイン方法を選ぶ' })).toHaveCount(0)
    await page.getByRole('button', { name: 'FFPF IDでログイン' }).click()
    await expect.poll(() => urls.length).toBe(1)
    expect(new URL(urls[0]).searchParams.get('provider')).toBe('ffpf')
  })

  test('an answer without providers keeps the GitHub button', async ({ page }) => {
    await answer(page, { user: null })
    await page.goto('/home')
    await expect(page.getByRole('button', { name: 'GitHubでログイン' })).toBeVisible()
  })

  test('a signed-in FFPF ID user sees how they signed in', async ({ page }) => {
    await answer(page, { user: { id: 'ffpf:cabc', name: '', image: null }, providers: ['github', 'ffpf'] })
    await page.goto('/home')
    await page.getByRole('button', { name: 'アカウントメニュー', exact: true }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toContainText('FFPF IDでログイン中')
    await expect(menu).toContainText('FFPF IDユーザー')
    await expect(menu).not.toContainText('GitHub')
  })

  test('a signed-in GitHub user still sees GitHub', async ({ page }) => {
    await answer(page, { user: { id: 'github:1', name: 'octo', image: null }, providers: ['github', 'ffpf'] })
    await page.goto('/home')
    await page.getByRole('button', { name: 'アカウントメニュー', exact: true }).click()
    await expect(page.getByRole('menu')).toContainText('GitHubでログイン中')
  })
})
