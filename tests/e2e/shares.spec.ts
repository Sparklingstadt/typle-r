import { test, expect, type Page } from '@playwright/test'
import { newAccountId, origin, signIn as signInAs, withDatabase } from './account'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))
const row = (page: Page) => page.locator('li[data-pack-id="pack-shared-one"]')

let accountId = ''
test.beforeEach(() => {
  accountId = newAccountId()
})
test.afterEach(() => withDatabase(async pool => {
  await pool.query('DELETE FROM typle_shared_packs WHERE owner_id = $1', [accountId])
  await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId])
  await pool.query('DELETE FROM typle_records WHERE owner_id = $1', [accountId])
}))

async function signIn(page: Page) {
  await signInAs(page.context(), accountId)
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
  // A guest starts with no packs, so one of its own is put in the browser first.
  await page.addInitScript(([k, raw]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, raw) },
    ['typle-r:guest-workspace:v1', JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, devices: [],
      packs: [{ id: 'pack-mine', name: 'Mine', createdAt: '2026-09-02' }],
      lists: [{ id: 'mine', name: 'Mine', packId: 'pack-mine', createdAt: '2026-09-02', words: words('ls'), records: [] }] })])
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

test('a share whose pack is gone is listed under the packs and can be stopped', async ({ page }) => {
  await signIn(page)
  const id = await shareByApi(page)
  // Older versions kept a pack's link after the pack went away; make one from the share above.
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const orphans = () => pool.query('SELECT 1 FROM typle_shared_packs WHERE owner_id = $1 AND pack_id = $2', [accountId, 'pack-gone'])
  try {
    await pool.query(`INSERT INTO typle_shared_packs (id, owner_id, pack_id, data)
      SELECT gen_random_uuid(), owner_id, 'pack-gone', jsonb_set(data, '{pack,name}', '"Gone pack"') FROM typle_shared_packs WHERE id = $1`, [id])

    await page.goto('/edit')
    const section = page.getByRole('region', { name: 'パックが見つからない共有' })
    await expect(section).toBeVisible()
    await expect(section.getByText('Gone pack', { exact: true })).toBeVisible()
    await expect(section.getByText('Shared pack', { exact: true })).toHaveCount(0)
    await expect(row(page).getByText('共有中', { exact: true })).toBeVisible()

    await section.getByRole('button', { name: 'Gone pack の共有をやめる' }).click()
    await expect(section).toHaveCount(0)
    await expect(page.locator('#list-heading')).toBeFocused()
    expect((await orphans()).rowCount).toBe(0)
    expect((await publicStatus(page, id)).status).toBe(200)
  } finally { await pool.end() }
})

test('deleting a shared pack never lists its share as one whose pack is gone', async ({ page }) => {
  await signIn(page)
  await shareByApi(page)
  await page.goto('/edit')
  await expect(row(page).getByText('共有中', { exact: true })).toBeVisible()
  // Holds the list read after the save, so a share list from before the delete would have time to show.
  let reads = 0
  await page.route('**/api/shares', async route => {
    if (route.request().method() === 'GET') {
      reads++
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    await route.continue()
  })
  await page.evaluate(() => {
    const seen = window as unknown as { orphansSeen?: boolean }
    new MutationObserver(() => { if (document.getElementById('orphan-shares-heading')) seen.orphansSeen = true })
      .observe(document.body, { childList: true, subtree: true })
  })

  const read = page.waitForResponse(response => response.url().endsWith('/api/shares') && response.request().method() === 'GET')
  await row(page).getByRole('button', { name: 'Shared pack のパックの操作' }).click()
  await page.getByRole('menuitem', { name: '削除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click()
  await expect(row(page)).toHaveCount(0)
  await read
  expect(reads).toBeGreaterThan(0)
  await expect(page.getByRole('region', { name: 'パックが見つからない共有' })).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { orphansSeen?: boolean }).orphansSeen ?? false)).toBe(false)
})

test('a failed share says why', async ({ page }) => {
  await signIn(page)
  await page.goto('/edit')
  await page.route('**/api/shares', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'packNotFound' }) })
    : route.continue())
  const dialog = await openShare(page)
  await dialog.getByRole('button', { name: 'リンクを作る' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('このパックが見つかりません。ページを再読み込みしてください。')

  // A failed save's text is about keeping what was typed, which is not what happened here; the dialog says its own.
  await page.unroute('**/api/shares')
  await page.route('**/api/shares', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'workspaceSaveFailed' }) })
    : route.continue())
  await dialog.getByRole('button', { name: 'リンクを作る' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('共有の操作ができませんでした。')
})

test('every copy of the link is announced, even right after the last one', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  await signIn(page)
  await page.goto('/edit')
  const dialog = await openShare(page)
  await dialog.getByRole('button', { name: 'リンクを作る' }).click()
  const announced = dialog.locator('[aria-live="polite"]')
  await expect(announced).toHaveText('')
  await dialog.getByRole('button', { name: 'コピー' }).click()
  await expect(announced).toContainText('コピーしました')
  const first = await announced.textContent()
  await dialog.getByRole('button', { name: 'コピーしました' }).click()
  await expect.poll(() => announced.textContent()).not.toBe(first)
  await expect(announced).toContainText('コピーしました')
})
