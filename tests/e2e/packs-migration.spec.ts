import { test, expect, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { sealSession } from './sessionCookie'
const key = 'typle-r:guest-workspace:v1'
const origin = 'http://127.0.0.1:3101'
const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
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
  const group = page.locator('li[data-group="Shell"]')
  await expect(group).toContainText('難易度別に2リスト')
  await expect(group).toContainText('3語')
  await expect(page.locator('li[data-list-id]')).toHaveCount(1)
  await expect(page.locator('li[data-group]')).toHaveCount(1)
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

  await page.reload()
  group = await expectGroupedView(page)
  await expect(group.getByRole('button', { name: 'Shell', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('a guest with nothing saved sees the initial lists in the same groups as v0.90.0', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/edit')
  await expect(page.locator('li[data-group]')).toHaveCount(17)
})

test.describe('account', () => {
  let accountId = ''
  test.beforeEach(async ({ context }) => {
    accountId = 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()
    const iat = Math.floor(Date.now() / 1000)
    const value = sealSession(secret, { sub: accountId, name: 'E2E User', image: '', iat, exp: iat + 3600 })
    await context.addCookies([{ name: 'typle-session', value, url: origin, httpOnly: true, sameSite: 'Lax' }])
  })
  test.afterEach(async () => {
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    try { await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId]) } finally { await pool.end() }
  })

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
})
