import { test, expect, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { sealSession } from './sessionCookie'
const origin = 'http://127.0.0.1:3101'
const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))
const row = (page: Page) => page.locator('li[data-pack-id="pack-shared-one"]')

let accountId = ''
test.beforeEach(() => {
  accountId = 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()
})
test.afterEach(async () => {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await pool.query('DELETE FROM typle_shared_packs WHERE owner_id = $1', [accountId])
    await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId])
  } finally { await pool.end() }
})

async function signIn(page: Page) {
  const iat = Math.floor(Date.now() / 1000)
  const value = sealSession(secret, { sub: accountId, name: 'E2E User', image: '', iat, exp: iat + 3600 })
  await page.context().addCookies([{ name: 'typle-session', value, url: origin, httpOnly: true, sameSite: 'Lax' }])
  const packs = [{ id: 'pack-shared-one', name: 'Shared pack', createdAt: '2026-09-02' }]
  const lists = [{ id: 'shared-one', name: 'Shared pack', packId: 'pack-shared-one', createdAt: '2026-09-02', words: words('ls', 'cd'), records: [] }]
  const put = await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { accountId, revision: 0, packs, lists } })
  expect(put.status()).toBe(200)
}

async function openShare(page: Page) {
  await row(page).getByRole('button', { name: 'Shared pack のパックの操作' }).click()
  await page.getByRole('menuitem', { name: '共有', exact: true }).click()
  return page.getByRole('dialog')
}

// A browser with no login, as the person who opens the link has.
async function publicStatus(browserPage: Page, id: string) {
  const response = await browserPage.context().browser()!.newContext({ baseURL: origin })
  try {
    const result = await response.request.get(`/api/shared?id=${id}`)
    return { status: result.status(), body: result.status() === 200 ? await result.json() : null }
  } finally { await response.close() }
}

test('sharing a pack shows the link and marks the row; a rename reaches the link only on update; stopping ends it', async ({ page }) => {
  await signIn(page)
  await page.goto('/edit')
  await expect(row(page)).toBeVisible()
  await expect(row(page).getByText('共有中', { exact: true })).toHaveCount(0)

  let dialog = await openShare(page)
  await dialog.getByRole('button', { name: 'リンクを作る' }).click()
  const link = dialog.getByRole('textbox', { name: '共有リンク' })
  await expect(link).toHaveValue(new RegExp(`^${origin}/shared/[0-9a-f-]{36}$`))
  const id = (await link.inputValue()).split('/').pop()!
  await expect(row(page).getByText('共有中', { exact: true })).toBeVisible()

  const first = await publicStatus(page, id)
  expect(first.status).toBe(200)
  expect(first.body.pack.name).toBe('Shared pack')

  // Renaming the pack does not change what is shared.
  await page.keyboard.press('Escape')
  const current = await (await page.request.get('/api/workspace')).json()
  const renamed = await page.request.put('/api/workspace', { headers: { Origin: origin },
    data: { accountId, revision: current.revision, packs: current.packs.map((pack: { name: string }) => ({ ...pack, name: 'Renamed pack' })), lists: current.lists } })
  expect(renamed.status()).toBe(200)
  expect((await publicStatus(page, id)).body.pack.name).toBe('Shared pack')

  await page.reload()
  await expect(row(page).getByText('共有中', { exact: true })).toBeVisible()
  await row(page).getByRole('button', { name: 'Renamed pack のパックの操作' }).click()
  await page.getByRole('menuitem', { name: '共有', exact: true }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox', { name: '共有リンク' })).toHaveValue(`${origin}/shared/${id}`)
  await expect(dialog.getByText('最終更新')).toBeVisible()
  await dialog.getByRole('button', { name: '共有を更新' }).click()
  await expect.poll(async () => (await publicStatus(page, id)).body?.pack.name).toBe('Renamed pack')
  await expect(dialog.getByRole('textbox', { name: '共有リンク' })).toHaveValue(`${origin}/shared/${id}`)

  await dialog.getByRole('button', { name: '共有をやめる' }).click()
  await expect(dialog.getByRole('button', { name: 'リンクを作る' })).toBeVisible()
  expect((await publicStatus(page, id)).status).toBe(404)
  await page.keyboard.press('Escape')
  await expect(row(page).getByText('共有中', { exact: true })).toHaveCount(0)
})

test('deleting a shared pack ends its share and the confirmation says so', async ({ page }) => {
  await signIn(page)
  await page.goto('/edit')
  const dialog = await openShare(page)
  await dialog.getByRole('button', { name: 'リンクを作る' }).click()
  const id = (await dialog.getByRole('textbox', { name: '共有リンク' }).inputValue()).split('/').pop()!
  await page.keyboard.press('Escape')

  await row(page).getByRole('button', { name: 'Shared pack のパックの操作' }).click()
  await page.getByRole('menuitem', { name: '削除', exact: true }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('共有も終わります')
  await confirm.getByRole('button', { name: '削除する' }).click()
  await expect(row(page)).toHaveCount(0)
  expect((await publicStatus(page, id)).status).toBe(404)
})

test('a guest has no share item in the pack menu', async ({ page }) => {
  await page.goto('/edit')
  await page.locator('li[data-pack-id]').first().getByRole('button', { name: /のパックの操作$/ }).click()
  await expect(page.getByRole('menuitem', { name: 'パックを編集' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '共有', exact: true })).toHaveCount(0)
})

// Shares the signed-in account's pack through the API and returns the link's id.
async function shareByApi(page: Page) {
  const response = await page.request.put('/api/shares', { headers: { Origin: origin }, data: { packId: 'pack-shared-one' } })
  expect(response.status()).toBe(200)
  return (await response.json()).id as string
}

test('a guest opens a shared link, sees the pack without its owner, and adds it to the browser storage', async ({ page, browser }) => {
  await signIn(page)
  const id = await shareByApi(page)

  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    await view.goto(`/shared/${id}`)
    await expect(view.getByRole('heading', { level: 1, name: 'Shared pack' })).toBeVisible()
    const table = view.getByRole('table', { name: 'Shared pack' })
    await expect(table.getByRole('cell', { name: 'ls', exact: true }).first()).toBeVisible()
    await expect(table.getByRole('cell', { name: 'cd', exact: true }).first()).toBeVisible()
    await expect(view.getByText('E2E User')).toHaveCount(0)
    await expect(view.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    await expect(view).toHaveTitle('共有されたパック | Typle')

    await view.getByRole('button', { name: '自分のパックに追加' }).click()
    await expect(view).toHaveURL(/\/edit\?pack=[^&]+$/)
    await expect(view.getByText('Shared pack', { exact: true }).first()).toBeVisible()

    // The same name again gets （2）.
    await view.goto(`/shared/${id}`)
    await view.getByRole('button', { name: '自分のパックに追加' }).click()
    await expect(view).toHaveURL(/\/edit\?pack=/)
    await expect(view.getByText('Shared pack（2）', { exact: true }).first()).toBeVisible()
  } finally { await guest.close() }
})

test('a link whose share was stopped, or an id that never existed, says the share has ended', async ({ page, browser }) => {
  await signIn(page)
  const id = await shareByApi(page)
  const stopped = await page.request.delete('/api/shares?pack=pack-shared-one', { headers: { Origin: origin } })
  expect(stopped.status()).toBe(204)

  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    for (const path of [id, 'not-an-id', '00000000-0000-4000-8000-000000000000']) {
      await view.goto(`/shared/${path}`)
      await expect(view.getByText('この共有は終了しました。')).toBeVisible()
      await expect(view.getByRole('link', { name: '単語パックを開く' })).toHaveAttribute('href', '/edit')
      await expect(view.getByRole('button', { name: '自分のパックに追加' })).toHaveCount(0)
    }
  } finally { await guest.close() }
})
