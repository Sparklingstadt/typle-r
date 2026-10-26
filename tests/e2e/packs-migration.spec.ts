import { test, expect, type Page } from '@playwright/test'
import { deleteWorkspace, newAccountId, origin, signIn } from './account'
const key = 'typle-r:guest-workspace:v1'
const words = (...texts: string[]) => texts.map(text => ({ display: text, input: text, annotation: '' }))
// The shape v0.90.0 saved: no packs, and group / category / tags on each list.
const member = (id: string, levels: string[], ...texts: string[]) =>
  ({ id, name: `Shell：${levels.join('・')}`, group: 'Shell', levels, category: 'CLI', tags: ['unix'], createdAt: '2026-09-01', words: words(...texts), records: [] })
const oldLists = () => [
  member('basic-1', ['基本', '初級'], 'ls', 'cd'),
  member('basic-2', ['基本', '上級'], 'find'),
  { id: 'plain', name: 'Plain', createdAt: '2026-09-02', words: words('x'), records: [] },
]

const saved = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), key)

async function expectGroupedView(page: Page) {
  // The two Shell lists are one pack row, and the list without a group is a pack row of its own.
  const group = page.locator('li[data-pack-id="pack-basic-1"]')
  await expect(group).toContainText('2リスト')
  await expect(group).toContainText('3語')
  await expect(page.locator('li[data-pack-id="pack-plain"]')).toContainText('1リスト')
  await expect(page.locator('li[data-pack-id]')).toHaveCount(2)
  return group
}

test('a guest workspace saved by v0.90.0 shows the same and is saved as packs when edited', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(([key, raw]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw) },
    [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: oldLists(), devices: [] })])
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/edit')
  let group = await expectGroupedView(page)

  await group.getByRole('button', { name: 'Shell', exact: true }).click()
  await group.getByRole('button', { name: 'Shell：基本・上級 を編集' }).click()
  await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Shell：基本・上級 改')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('「Shell：基本・上級 改」を更新しました。')).toBeVisible()

  const workspace = await saved(page)
  expect(Array.isArray(workspace.packs)).toBe(true)
  expect(workspace.lists).toHaveLength(3)
  for (const list of workspace.lists) {
    expect(typeof list.packId).toBe('string')
    expect(list).not.toHaveProperty('group')
    expect(list).not.toHaveProperty('category')
    expect(list).not.toHaveProperty('tags')
    expect(workspace.packs.some((pack: { id: string }) => pack.id === list.packId)).toBe(true)
  }
  const shell = workspace.packs.find((pack: { id: string }) => pack.id === 'pack-basic-1')
  expect(shell).toMatchObject({ name: 'Shell', category: 'CLI', tags: ['unix'] })
  // A list has one level at most: the two levels of each old list were joined into one.
  expect(workspace.lists.map((list: { levels: string[] }) => list.levels)).toEqual([['基本・初級'], ['基本・上級'], undefined])

  await page.reload()
  group = await expectGroupedView(page)
  await expect(group.getByRole('button', { name: 'Shell', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

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

  test('a row whose packs is NULL is read, shown, and gets packs when saved', async ({ page }) => {
    const { Pool } = await import('pg')
    const put = await page.request.put('/api/workspace', { headers: { Origin: origin }, data: { accountId, revision: 0, lists: oldLists() } })
    expect(put.status()).toBe(200)
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const packs = async () => (await pool.query('SELECT packs FROM typle_workspaces WHERE owner_id = $1', [accountId])).rows[0].packs
    try {
      await pool.query('UPDATE typle_workspaces SET packs = NULL WHERE owner_id = $1', [accountId])
      expect(await packs()).toBeNull()

      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto('/edit')
      const group = await expectGroupedView(page)
      await group.getByRole('button', { name: 'Shell', exact: true }).click()
      await group.getByRole('button', { name: 'Shell：基本・上級 を編集' }).click()
      await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Shell：基本・上級 改')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await expect(page.getByText('「Shell：基本・上級 改」を更新しました。')).toBeVisible()

      await expect.poll(async () => (await packs())?.length ?? 0).toBeGreaterThan(0)
      const body = await (await page.request.get('/api/workspace')).json()
      expect(body.lists).toHaveLength(3)
      for (const list of body.lists) {
        expect(typeof list.packId).toBe('string')
        expect(list).not.toHaveProperty('group')
      }
      expect(body.packs.find((pack: { id: string }) => pack.id === 'pack-basic-1')).toMatchObject({ name: 'Shell', category: 'CLI', tags: ['unix'] })
    } finally { await pool.end() }
  })

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
