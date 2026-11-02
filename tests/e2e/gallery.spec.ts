import { test, expect, type Page } from '@playwright/test'
import { newAccountId, origin, signIn as signInAs, withDatabase } from './account'
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

// Signs in as the owner and saves one pack, then shares it (listed in the gallery or not). Returns the share id.
async function share(page: Page, listed: boolean) {
  await signInAs(page.context(), accountId)
  const packs = [{ id: 'pack-gallery-one', name: packName, category: 'E2E', tags: ['gallery-e2e'], createdAt: '2026-11-02' }]
  const lists = [{ id: 'gallery-one', name: packName, packId: 'pack-gallery-one', createdAt: '2026-11-02', words: words('ls', 'cd', 'pwd'), records: [] }]
  const put = await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { accountId, revision: 0, packs, lists } })
  expect(put.status()).toBe(200)
  const shared = await page.request.put('/api/shares', { headers: { Origin: origin }, data: listed ? { packId: 'pack-gallery-one', listed: true } : { packId: 'pack-gallery-one' } })
  expect(shared.status()).toBe(200)
  return (await shared.json()).id as string
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
    await view.getByRole('combobox', { name: 'カテゴリー' }).selectOption('E2E')
    await expect(view).toHaveURL(/category=E2E/)
    await view.getByRole('combobox', { name: '並べ替え' }).selectOption('popular')
    await expect(view).toHaveURL(/sort=popular/)
    await view.getByRole('searchbox', { name: '検索' }).fill(accountId)
    await view.getByRole('button', { name: '検索' }).click()
    await expect(view).toHaveURL(/q=github/)
    await expect(view.getByRole('main').getByRole('listitem')).toHaveCount(1)

    await view.reload()
    await expect(view.getByRole('searchbox', { name: '検索' })).toHaveValue(accountId)
    await expect(view.getByRole('combobox', { name: 'カテゴリー' })).toHaveValue('E2E')
    await expect(view.getByRole('combobox', { name: '並べ替え' })).toHaveValue('popular')
    await expect(view.getByRole('main').getByRole('listitem')).toHaveCount(1)
  } finally { await guest.close() }
})

test('a failed count does not spoil the add', async ({ page, browser }) => {
  const id = await share(page, true)
  const guest = await browser.newContext({ baseURL: origin })
  try {
    const view = await guest.newPage()
    await view.route('**/api/gallery/added**', route => route.abort())
    await view.goto(`/shared/${id}`)
    await view.getByRole('button', { name: '自分のパックに追加' }).click()
    await expect(view).toHaveURL(/\/edit\?pack=/)
    await expect(view.locator('[data-slot="alert"]')).toHaveCount(0)
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

    const counted = view.waitForResponse(response => response.url().includes('/api/gallery/added'))
    await view.goto(`/shared/${id}`)
    await view.getByRole('button', { name: '自分のパックに追加' }).click()
    await expect(view).toHaveURL(/\/edit\?pack=/)
    await counted
  } finally { await guest.close() }
  const rows = await withDatabase(pool => pool.query('SELECT add_count FROM typle_shared_packs WHERE owner_id = $1', [accountId]))
  expect(rows.rows.map(row => Number(row.add_count))).toEqual([0])
})
