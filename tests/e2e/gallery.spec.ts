import { test, expect, type Page } from '@playwright/test'
import { newAccountId, origin, signIn as signInAs, withDatabase } from './account'
import { API, apiError, endpointOf } from './api'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))

let accountId = ''
let packName = ''
test.beforeEach(() => {
  accountId = newAccountId()
  packName = `Gallery ${accountId}`
})
test.afterEach(() => withDatabase(async pool => {
  await pool.query('DELETE FROM typle_shared_packs WHERE owner_id = $1', [accountId])
  await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId])
  await pool.query('DELETE FROM typle_records WHERE owner_id = $1', [accountId])
}))

// Signs in as the owner and saves one pack (with a category unless told otherwise).
async function savePack(page: Page, category = 'E2E') {
  await signInAs(page.context(), accountId)
  const packs = [{ id: 'pack-gallery-one', name: packName, ...(category ? { category } : {}), tags: ['gallery-e2e'], createdAt: '2026-11-02' }]
  const lists = [{ id: 'gallery-one', name: packName, packId: 'pack-gallery-one', createdAt: '2026-11-02', words: words('ls', 'cd', 'pwd'), records: [] }]
  const put = await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { accountId, revision: 0, packs, lists } })
  expect(put.status()).toBe(200)
}

// Saves the pack, then shares it (listed in the gallery or not). Returns the share id.
async function share(page: Page, listed: boolean) {
  await savePack(page)
  const shared = await page.request.put('/api/shares', { headers: { Origin: origin }, data: listed ? { packId: 'pack-gallery-one', listed: true } : { packId: 'pack-gallery-one' } })
  expect(shared.status()).toBe(200)
  return (await shared.json()).id as string
}

const row = (page: Page) => page.locator('li[data-pack-id="pack-gallery-one"]')
async function openShare(page: Page) {
  await row(page).getByRole('button', { name: `${packName} のパックの操作` }).click()
  await page.getByRole('menuitem', { name: '共有', exact: true }).click()
  return page.getByRole('dialog')
}

async function galleryEntry(page: Page) {
  const response = await page.request.get(`/api/gallery?q=${encodeURIComponent(accountId)}`)
  expect(response.status()).toBe(200)
  return (await response.json()).packs as { name: string; added: number }[]
}

test('a pack put in the gallery is found by a guest, previewed and added, and its count goes up', async ({ page, browser }) => {
  const id = await share(page, true)
  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    await view.goto(`/gallery?q=${encodeURIComponent(accountId)}`)
    await expect(view.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    const cards = view.getByRole('main').getByRole('listitem')
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText(packName)
    await expect(cards.first()).toContainText('リスト 1')
    await expect(cards.first()).toContainText('単語 3')
    await expect(cards.first()).toContainText('追加 0')
    await expect(cards.first()).toContainText('gallery-e2e')

    await view.getByRole('link', { name: new RegExp(packName) }).click()
    await expect(view).toHaveURL(`${origin}/shared/${id}`)
    await view.getByRole('button', { name: '自分のパックに追加' }).click()
    await expect(view).toHaveURL(/\/edit\?pack=/)
  } finally { await guest.close() }
  await expect.poll(async () => (await galleryEntry(page))[0]?.added).toBe(1)
})

test('the search, category and order are kept in the URL', async ({ page, browser }) => {
  await share(page, true)
  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    await view.goto('/gallery')
    await view.getByRole('combobox', { name: 'カテゴリ' }).selectOption('E2E')
    await expect(view).toHaveURL(/category=E2E/)
    await view.getByRole('combobox', { name: '並べ替え' }).selectOption('popular')
    await expect(view).toHaveURL(/sort=popular/)
    await view.getByRole('searchbox', { name: '検索' }).fill(accountId)
    await view.getByRole('button', { name: '検索' }).click()
    await expect(view).toHaveURL(new RegExp(`q=${encodeURIComponent(accountId)}`))
    await expect(view.getByRole('main').getByRole('listitem')).toHaveCount(1)

    await view.reload()
    await expect(view.getByRole('searchbox', { name: '検索' })).toHaveValue(accountId)
    await expect(view.getByRole('combobox', { name: 'カテゴリ' })).toHaveValue('E2E')
    await expect(view.getByRole('combobox', { name: '並べ替え' })).toHaveValue('popular')
    await expect(view.getByRole('main').getByRole('listitem')).toHaveCount(1)
  } finally { await guest.close() }
})

test('a failed count does not spoil the add', async ({ page, browser }) => {
  const id = await share(page, true)
  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    let attempts = 0
    await view.route(API, route => {
      if (endpointOf(route.request()) !== 'POST /api/gallery/added') return route.fallback()
      attempts++
      return route.abort()
    })
    await view.goto(`/shared/${id}`)
    await expect(view.getByRole('button', { name: '自分のパックに追加' })).toBeEnabled()
    await expect(view.locator('[data-slot="alert"]')).toHaveCount(0)
    await view.getByRole('button', { name: '自分のパックに追加' }).click()
    await expect(view).toHaveURL(/\/edit\?pack=/)
    await expect(view.locator('[data-slot="alert"]')).toHaveCount(0)
    // The count was tried (and refused) without anything being shown.
    await expect.poll(() => attempts).toBe(1)
  } finally { await guest.close() }
})

test('a pack that is not in the gallery is not listed and its add is not counted', async ({ page, browser }) => {
  const id = await share(page, false)
  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    await view.goto(`/gallery?q=${encodeURIComponent(accountId)}`)
    await expect(view.getByText('見つかりませんでした')).toBeVisible()
    await expect(view.getByRole('main').getByRole('listitem')).toHaveCount(0)

    const counted = view.waitForResponse(response => endpointOf(response.request()) === 'POST /api/gallery/added')
    await view.goto(`/shared/${id}`)
    await view.getByRole('button', { name: '自分のパックに追加' }).click()
    await expect(view).toHaveURL(/\/edit\?pack=/)
    await counted
  } finally { await guest.close() }
  const rows = await withDatabase(pool => pool.query('SELECT add_count FROM typle_shared_packs WHERE owner_id = $1', [accountId]))
  expect(rows.rows.map(row => Number(row.add_count))).toEqual([0])
})

const reports = (shareId: string) => withDatabase(pool => pool.query('SELECT reason FROM typle_gallery_reports WHERE share_id = $1', [shareId]))

test('a guest reports a pack in the gallery and an administrator sees it', async ({ page, browser }) => {
  const id = await share(page, true)
  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    await view.goto(`/shared/${id}`)
    await view.getByRole('button', { name: '通報' }).click()
    const dialog = view.getByRole('dialog')
    const send = dialog.getByRole('button', { name: '送る' })
    // Nothing can be sent before a reason is chosen.
    await expect(send).toBeDisabled()
    await dialog.getByRole('radio', { name: 'スパム・宣伝' }).check()
    await expect(send).toBeEnabled()
    await send.click()
    await expect(dialog).toBeHidden()
    await expect(view.getByRole('status').filter({ hasText: '通報を受け付けました' })).toBeVisible()
  } finally { await guest.close() }
  expect((await reports(id)).rows.map(row => row.reason)).toEqual(['spam'])
})

test('reporting a pack that is only shared by link says it failed', async ({ page, browser }) => {
  const id = await share(page, false)
  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    await view.goto(`/shared/${id}`)
    await view.getByRole('button', { name: '通報' }).click()
    const dialog = view.getByRole('dialog')
    await dialog.getByRole('radio', { name: 'その他' }).check()
    await dialog.getByRole('button', { name: '送る' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('ギャラリーに載っていないパックは通報できません。')
    await expect(view.getByRole('status').filter({ hasText: '通報を受け付けました' })).toHaveCount(0)
  } finally { await guest.close() }
  expect((await reports(id)).rows).toHaveLength(0)
})

// The real count is tested in Go (server/internal/web, server/internal/store). Here every request comes from 127.0.0.1,
// so really sending more than 10 reports would use up the allowance that the other tests (and workers) share; the
// answer of an over-the-limit report is mocked to check what the dialog shows.
test('a report refused for too many requests says to try again later', async ({ page, browser }) => {
  const id = await share(page, true)
  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    await view.route(API, route => endpointOf(route.request()) === 'POST /api/gallery/reports'
      ? route.fulfill({ ...apiError('tooManyRequests', 429), headers: { 'Retry-After': '30' } })
      : route.fallback())
    await view.goto(`/shared/${id}`)
    await view.getByRole('button', { name: '通報' }).click()
    const dialog = view.getByRole('dialog')
    await dialog.getByRole('radio', { name: 'スパム・宣伝' }).check()
    await dialog.getByRole('button', { name: '送る' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('しばらくしてからもう一度お試しください。')
    await expect(view.getByRole('status').filter({ hasText: '通報を受け付けました' })).toHaveCount(0)
  } finally { await guest.close() }
  expect((await reports(id)).rows).toHaveLength(0)
})

test('the owner puts a pack in the gallery from the share dialog and takes it out', async ({ page }) => {
  await savePack(page)
  await page.goto('/edit')
  const dialog = await openShare(page)
  const toggle = dialog.getByRole('switch', { name: 'ギャラリーに載せる' })
  // Without a link yet the switch is there; turning it on makes the link and lists it in one request.
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(dialog.getByRole('textbox', { name: '共有リンク' })).toBeVisible()
  await expect(toggle).toBeChecked()
  await expect(dialog.getByText('ギャラリーではだれでも見られます。作者名は出ません。不適切な内容は管理者が非公開にすることがあります')).toBeVisible()
  await expect(row(page).getByText('共有中', { exact: true })).toBeVisible()
  await expect(row(page).getByText('ギャラリーに掲載中', { exact: true })).toBeVisible()
  expect(await galleryEntry(page)).toHaveLength(1)

  // A reload keeps it, and updating the share keeps the listing.
  await page.reload()
  await expect(row(page).getByText('ギャラリーに掲載中', { exact: true })).toBeVisible()
  const again = await openShare(page)
  await expect(again.getByRole('switch', { name: 'ギャラリーに載せる' })).toBeChecked()
  const [updated] = await Promise.all([
    page.waitForResponse(r => endpointOf(r.request()) === 'PUT /api/shares'),
    again.getByRole('button', { name: '共有を更新' }).click(),
  ])
  expect(updated.status()).toBe(200)
  await expect(again.getByRole('button', { name: '共有を更新' })).toBeEnabled()
  expect(await galleryEntry(page)).toHaveLength(1)

  await again.getByRole('switch', { name: 'ギャラリーに載せる' }).click()
  await expect(again.getByRole('switch', { name: 'ギャラリーに載せる' })).not.toBeChecked()
  await expect(row(page).getByText('ギャラリーに掲載中', { exact: true })).toHaveCount(0)
  await expect(row(page).getByText('共有中', { exact: true })).toBeVisible()
  expect(await galleryEntry(page)).toHaveLength(0)
  await expect(again.getByRole('textbox', { name: '共有リンク' })).toBeVisible()
})

test('a pack without a category is told it would be easier to find', async ({ page }) => {
  await savePack(page, '')
  await page.goto('/edit')
  const dialog = await openShare(page)
  await expect(dialog.getByText('カテゴリを付けると見つけてもらいやすくなります')).toBeVisible()
  await dialog.getByRole('switch', { name: 'ギャラリーに載せる' }).click()
  await expect(row(page).getByText('ギャラリーに掲載中', { exact: true })).toBeVisible()
  expect(await galleryEntry(page)).toHaveLength(1)
})

test('a pack with a category is not told to add one', async ({ page }) => {
  await savePack(page)
  await page.goto('/edit')
  const dialog = await openShare(page)
  await expect(dialog.getByRole('switch', { name: 'ギャラリーに載せる' })).toBeVisible()
  await expect(dialog.getByText('カテゴリを付けると見つけてもらいやすくなります')).toHaveCount(0)
})

test('a pack hidden by an administrator says so and cannot be put back by its owner', async ({ page }) => {
  const id = await share(page, true)
  await withDatabase(pool => pool.query('UPDATE typle_shared_packs SET hidden_at = now() WHERE id = $1', [id]))
  await page.goto('/edit')
  await expect(row(page).getByText('非公開にされました', { exact: true })).toBeVisible()
  await expect(row(page).getByText('ギャラリーに掲載中', { exact: true })).toHaveCount(0)
  const dialog = await openShare(page)
  await expect(dialog.getByRole('switch', { name: 'ギャラリーに載せる' })).toBeDisabled()
  await expect(dialog.getByText('管理者により非公開にされたため')).toBeVisible()
  const [updated] = await Promise.all([
    page.waitForResponse(r => endpointOf(r.request()) === 'PUT /api/shares'),
    dialog.getByRole('button', { name: '共有を更新' }).click(),
  ])
  expect(updated.status()).toBe(200)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '共有を更新' })).toBeEnabled()
  const guest = await page.context().browser()!.newContext({ baseURL: origin })
  try { expect((await guest.request.get(`/api/shared?id=${id}`)).status()).toBe(404) } finally { await guest.close() }
  await expect(dialog.getByRole('button', { name: '共有をやめる' })).toBeEnabled()
})

test('a failed change puts the switch back and says why', async ({ page }) => {
  await share(page, false)
  await page.goto('/edit')
  await page.route(API, route => endpointOf(route.request()) === 'PUT /api/shares'
    ? route.fulfill(apiError('databaseUnavailable', 503))
    : route.fallback())
  const dialog = await openShare(page)
  const toggle = dialog.getByRole('switch', { name: 'ギャラリーに載せる' })
  await toggle.click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(toggle).not.toBeChecked()
  await expect(toggle).toBeEnabled()
  await expect(row(page).getByText('ギャラリーに掲載中', { exact: true })).toHaveCount(0)
  expect(await galleryEntry(page)).toHaveLength(0)
})

test('a pack hidden while the dialog is open is shown as hidden after the refused change', async ({ page }) => {
  await share(page, false)
  await page.goto('/edit')
  await page.route(API, route => endpointOf(route.request()) === 'PUT /api/shares'
    ? route.fulfill(apiError('sharedPackHidden', 409))
    : route.fallback())
  const dialog = await openShare(page)
  await dialog.getByRole('switch', { name: 'ギャラリーに載せる' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByRole('switch', { name: 'ギャラリーに載せる' })).toBeDisabled()
  await expect(dialog.getByRole('switch', { name: 'ギャラリーに載せる' })).not.toBeChecked()
  await expect(row(page).getByText('非公開にされました', { exact: true })).toBeVisible()
})
