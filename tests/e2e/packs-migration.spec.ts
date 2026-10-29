import { test, expect, type Page } from '@playwright/test'
import { deleteWorkspace, newAccountId, origin, signIn } from './account'
const key = 'typle-r:guest-workspace:v1'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))
const saved = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), key)

test('a guest with nothing saved starts with no packs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/edit')
  await expect(page.getByText('まだパックがありません。公式パックをフォローするか、新しいパックを作りましょう')).toBeVisible()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(0)
})

// Before v0.98.0 every account held a copy of each official pack. The copies that are not followed are removed when
// read, with their lists and records; the user's own packs stay.
const officialId = 'pack-8f3cf116-1f9f-4579-a071-e600094b104d'
const copy = (packId: string, id: string, name: string) =>
  ({ id, name, packId, createdAt: '2026-09-01', words: words('ls'), records: [{ id: `${id}-r`, time: 5, date: '2026-09-02T00:00:00.000Z', mistakes: 0, accuracy: 100, wordCount: 1 }] })
const migratedWorkspace = () => ({
  packs: [
    { id: officialId, name: 'macOSターミナル（zsh）コマンド', createdAt: '2026-09-01' },
    { id: 'pack-copy', name: 'AWS CLIコマンド', origin: { catalogId: 'pack-ef974a4b-3c7a-4eeb-9979-6721a0a1c81a', version: 1 }, createdAt: '2026-09-01' },
    { id: 'pack-mine', name: 'My pack', createdAt: '2026-09-01' },
  ],
  lists: [copy(officialId, 'official-list', 'zsh'), copy('pack-copy', 'copy-list', 'aws'), copy('pack-mine', 'mine-list', 'Mine')],
})

test('a guest workspace with copies of official packs loses the copies and their records but keeps its own pack', async ({ page }) => {
  await page.addInitScript(([key, raw]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw) },
    [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, ...migratedWorkspace(), devices: [] })])
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/edit')
  await expect(page.locator('li[data-pack-id]')).toHaveCount(1)
  await expect(page.locator('li[data-pack-id="pack-mine"]')).toContainText('My pack')
  await expect(page.getByRole('button', { name: 'macOSターミナル（zsh）コマンド', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'AWS CLIコマンド', exact: true })).toHaveCount(0)
  // The next save keeps the result: the copies and their records are gone from the saved data.
  await page.getByRole('button', { name: 'My pack のパックの操作' }).click()
  await page.getByRole('menuitem', { name: '複製' }).click()
  await expect(page.locator('li[data-pack-id]')).toHaveCount(2)
  const workspace = await saved(page)
  expect(workspace.packs.map((pack: { id: string }) => pack.id)).toContain('pack-mine')
  expect(workspace.packs.some((pack: { id: string }) => pack.id === officialId || pack.id === 'pack-copy')).toBe(false)
  expect(workspace.lists.some((list: { id: string }) => list.id === 'official-list' || list.id === 'copy-list')).toBe(false)
  expect(workspace.lists.find((list: { id: string }) => list.id === 'mine-list').records).toHaveLength(1)
})

test.describe('account', () => {
  let accountId = ''
  test.beforeEach(async ({ context }) => {
    accountId = newAccountId()
    await signIn(context, accountId)
  })
  test.afterEach(() => deleteWorkspace(accountId))

  test('an account row with copies of official packs loses the copies and their records, not its own pack', async ({ page }) => {
    const { packs, lists } = migratedWorkspace()
    const put = await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { accountId, revision: 0, packs, lists } })
    expect(put.status()).toBe(200)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/edit')
    await expect(page.locator('li[data-pack-id]')).toHaveCount(1)
    await expect(page.locator('li[data-pack-id="pack-mine"]')).toContainText('My pack')
    const body = await (await page.request.get('/api/workspace')).json()
    expect(body.packs.map((pack: { id: string }) => pack.id)).toEqual(['pack-mine'])
    expect(body.lists.map((list: { id: string }) => list.id)).toEqual(['mine-list'])
    expect(body.lists[0].records).toHaveLength(1)
  })
})
