import { test, expect, type Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { randomBytes } from 'node:crypto'
const origin = 'http://127.0.0.1:3101'
const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
const key = 'typle-r:guest-workspace:v1'
const english = { id: 'en', name: 'English', createdAt: '2026-10-01', words: [{ display: 'apple', input: 'apple', annotation: '' }],
  records: [{ id: 'r1', time: 3, date: '2026-10-01T00:00:00.000Z', accuracy: 100, mistakes: 0, wordCount: 1 }] }

function switcher(page: Page) {
  return page.getByRole('button', { name: /^プロファイルを切り替え（現在：/ })
}

async function addProfile(page: Page, name: string, use = true) {
  await page.getByRole('button', { name: 'プロファイルを追加', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'プロファイルを追加' })
  await dialog.getByRole('textbox', { name: 'プロファイル名', exact: true }).fill(name)
  if (!use) await dialog.getByRole('checkbox', { name: '追加したプロファイルに切り替える' }).uncheck()
  await dialog.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

test('guest profiles keep separate word lists and records, and switch from the sidebar', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: [english], devices: [] })])
  await page.goto('/profiles')
  const main = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'メイン', exact: true }) })
  await expect(main).toContainText('使用中')
  await expect(main).toContainText('単語リスト 1件 · 練習 1回')
  await expect(page.getByRole('button', { name: 'メイン を削除' })).toHaveCount(0)

  // Mistakes are explained on the field, and a new profile starts empty and becomes the one in use.
  await page.getByRole('button', { name: 'プロファイルを追加', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'プロファイルを追加' })
  const name = dialog.getByRole('textbox', { name: 'プロファイル名', exact: true })
  await name.fill(' メイン ')
  await dialog.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(name).toHaveAccessibleDescription(/「メイン」はすでにあります。/)
  await name.fill('中国語')
  await name.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('プロファイル「中国語」を追加して切り替えました。')).toBeVisible()
  await expect(switcher(page)).toHaveAccessibleName('プロファイルを切り替え（現在：中国語）')
  const chinese = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: '中国語', exact: true }) })
  await expect(chinese).toContainText('使用中')
  await expect(chinese).toContainText('単語リスト 0件 · 練習 0回')

  await page.goto('/edit')
  await expect(page.getByRole('button', { name: 'English を編集', exact: true })).toHaveCount(0)
  await page.goto('/records')
  await expect(page.getByText('English')).toHaveCount(0)

  // The sidebar switches back; the choice is remembered after a reload.
  await page.goto('/edit')
  await switcher(page).click()
  await page.getByRole('menuitemradio', { name: 'メイン' }).click()
  await expect(switcher(page)).toHaveAccessibleName('プロファイルを切り替え（現在：メイン）')
  await expect(page.getByRole('button', { name: 'English を編集', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'English を編集', exact: true })).toBeVisible()

  // Unsaved changes in an editor are not dropped by switching.
  await page.goto('/create')
  const listName = page.getByRole('textbox', { name: '単語リスト名', exact: true })
  await listName.fill('Draft')
  await switcher(page).click()
  await expect(page.getByRole('menuitemradio', { name: '中国語' })).toBeDisabled()
  await expect(page.getByRole('menu')).toContainText('編集中の単語リストを保存するかキャンセルすると切り替えられます')
  await page.keyboard.press('Escape')
  await listName.fill('')
  await switcher(page).click()
  await expect(page.getByRole('menuitemradio', { name: '中国語' })).toBeEnabled()
  await page.keyboard.press('Escape')

  // Rename, then delete the profile in use: the browser falls back to the first profile and its data stays.
  await page.goto('/profiles')
  await page.getByRole('button', { name: '中国語 に切り替える' }).click()
  await expect(switcher(page)).toHaveAccessibleName('プロファイルを切り替え（現在：中国語）')
  await page.getByRole('button', { name: '中国語 の名前を変更' }).click()
  const rename = page.getByRole('dialog', { name: 'プロファイル名を変更' })
  await rename.getByRole('textbox', { name: 'プロファイル名', exact: true }).fill('中文')
  await rename.getByRole('button', { name: '変更を保存', exact: true }).click()
  await expect(switcher(page)).toHaveAccessibleName('プロファイルを切り替え（現在：中文）')
  await page.getByRole('button', { name: '中文 を削除' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('このブラウザーは「メイン」に切り替わります。')
  await confirm.getByRole('button', { name: '削除する', exact: true }).click()
  await expect(page.getByText('プロファイル「中文」を削除しました。')).toBeVisible()
  await expect(switcher(page)).toHaveAccessibleName('プロファイルを切り替え（現在：メイン）')
  await expect(page.getByRole('heading', { name: '中文', exact: true })).toHaveCount(0)
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), key)
  expect(stored.lists.map((list: { name: string }) => list.name)).toEqual(['English'])
  expect(stored.profiles).toEqual([{ id: 'default', name: 'メイン' }])
  expect(errors).toEqual([])
})

test('account profiles sync between browsers, while each browser keeps its own choice', async ({ browser }) => {
  const accountId = 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()
  const token = await encode({ token: { sub: accountId, name: 'Profile User' }, secret, salt: 'authjs.session-token' })
  const open = async () => {
    const context = await browser.newContext()
    await context.addCookies([{ name: 'authjs.session-token', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }])
    return context
  }
  const first = await open()
  const second = await open()
  try {
    const page = await first.newPage()
    await page.goto('/profiles')
    await expect(page.getByText('アカウントに保存', { exact: true }).first()).toBeVisible()
    await addProfile(page, '韓国語')
    await expect(switcher(page)).toHaveAccessibleName('プロファイルを切り替え（現在：韓国語）')
    // Save a list in the new profile through the same API the screens use.
    const state = await (await page.request.get('/api/workspace?profile=' + await page.evaluate(id => localStorage.getItem(`typle-r:profile:${id}`), accountId))).json()
    expect(state.profileId).not.toBe('default')
    const korean = { ...english, id: 'ko', name: '한국어', records: [] }
    const saved = await page.request.put('/api/workspace', { headers: { Origin: origin },
      data: { accountId, revision: state.revision, profileId: state.profileId, lists: [korean] } })
    expect(saved.status()).toBe(200)
    await page.goto('/edit')
    await expect(page.getByRole('button', { name: '한국어 を編集', exact: true })).toBeVisible()

    // Another browser of the same account opens the first profile, but can switch to the synced one.
    const other = await second.newPage()
    await other.goto('/edit')
    await expect(switcher(other)).toHaveAccessibleName('プロファイルを切り替え（現在：メイン）')
    await expect(other.getByRole('button', { name: '한국어 を編集', exact: true })).toHaveCount(0)
    await switcher(other).click()
    await other.getByRole('menuitemradio', { name: '韓国語' }).click()
    await expect(other.getByRole('button', { name: '한국어 を編集', exact: true })).toBeVisible()

    // Deleting it in the first browser sends the other one back to the first profile on its next load.
    await page.goto('/profiles')
    await page.getByRole('button', { name: '韓国語 を削除' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('単語リスト1件・練習記録0回を削除します。')
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する', exact: true }).click()
    await expect(switcher(page)).toHaveAccessibleName('プロファイルを切り替え（現在：メイン）')
    await other.reload()
    await expect(switcher(other)).toHaveAccessibleName('プロファイルを切り替え（現在：メイン）')
    await expect(other.getByRole('button', { name: '한국어 を編集', exact: true })).toHaveCount(0)
  } finally {
    await first.close()
    await second.close()
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    try { await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId]) } finally { await pool.end() }
  }
})
