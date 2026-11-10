import { test, expect } from '@playwright/test'

// The official data writes the ド of this name as ト and a combining dakuten.
const LINUX_BASICS = 'Linuxコマンド：基本'.normalize('NFD')

// With no pack, /play offers three official packs; choosing one follows it and starts its first list.
test('a guest with no pack starts practice from a starter pack on /play', async ({ page }) => {
  await page.goto('/play')
  await expect(page.getByRole('heading', { level: 1, name: 'どれから練習しますか？' })).toBeVisible()
  const cards = page.locator('li[data-catalog-id]')
  await expect(cards).toHaveCount(3)
  await expect(cards.getByRole('heading', { level: 2 })).toHaveText(['英語：基礎・中級', LINUX_BASICS, '中国語：HSK5級レベル単語'])
  const linux = cards.filter({ has: page.getByRole('heading', { name: LINUX_BASICS, exact: true }) })
  await expect(linux.getByText('1リスト・118語')).toBeVisible()
  await expect(linux.getByRole('listitem').first()).toHaveText('pwd')
  await expect(page.getByRole('link', { name: 'ほかの公式パックを見る' })).toHaveAttribute('href', '/packs/catalog')

  await linux.getByRole('button', { name: 'このパックで始める' }).click()
  await expect(page).toHaveURL(/\/play\?list=/)
  await expect(page.getByRole('textbox', { name: '表示された文字を入力', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^単語リストを切り替える（現在: .*${LINUX_BASICS}`) })).toBeVisible()
  await page.goto('/packs/catalog')
  const entry = page.locator('li[data-catalog-id]', { has: page.getByRole('heading', { name: LINUX_BASICS, exact: true }) })
  await expect(entry.getByRole('button', { name: 'フォロー中' })).toBeDisabled()
})

// A guest starts with no packs: the official ones are followed from the catalog.
test('a guest follows an official pack from the catalog, practises it and unfollows it', async ({ page }) => {
  await page.goto('/edit')
  await expect(page.getByText('まだパックがありません。公式パックをフォローするか、新しいパックを作りましょう')).toBeVisible()
  await page.getByRole('link', { name: '公式パックをフォローする' }).click()
  await expect(page).toHaveURL(/\/packs\/catalog$/)

  const entry = page.locator('li[data-catalog-id]', { has: page.getByRole('heading', { name: 'Go構文', exact: true }) })
  await expect(entry).toHaveCount(1)
  await expect(entry.getByRole('button', { name: 'フォロー解除' })).toHaveCount(0)
  await entry.getByRole('button', { name: 'Go構文 をフォローする', exact: true }).click()
  await expect(page.getByText('「Go構文」をフォローしました')).toBeVisible()
  // The catalog stays open, and the focus moves from the follow button to the pack's 「開く」 link.
  await expect(page).toHaveURL(/\/packs\/catalog$/)
  await expect(entry.getByRole('button', { name: 'フォロー中' })).toBeDisabled()
  await expect(entry.getByRole('link', { name: /開く/ })).toBeFocused()
  await entry.getByRole('link', { name: /開く/ }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)

  const row = page.locator('li[data-pack-id]', { has: page.getByRole('button', { name: 'Go構文', exact: true }) })
  await expect(row).toBeVisible()
  await expect(row.getByText('公式', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Go構文 のパックの操作' }).click()
  await expect(page.getByRole('menuitem', { name: '複製' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '書き出す' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'パックを編集' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'リストを追加' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '削除' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'フォロー解除' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row.locator('li[data-list-id]').first()).toBeVisible()
  await expect(row.locator('li[data-list-id]')).toHaveCount(3)
  await expect(row.locator('[data-edit]')).toHaveCount(0)

  await page.goto('/play')
  await page.getByRole('button', { name: /^単語リストを切り替える/ }).click()
  const picker = page.getByRole('dialog', { name: '単語リストを選ぶ' })
  await picker.getByRole('button', { name: '中級', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '表示された文字を入力', exact: true })).toBeVisible()

  await page.goto('/packs/catalog')
  await expect(entry.getByRole('link', { name: /開く/ })).toBeVisible()
  await entry.getByRole('button', { name: 'Go構文 のフォローを解除', exact: true }).click()
  await page.getByRole('alertdialog').getByText('「Go構文」のフォローを解除します。このパックの記録も消えます').waitFor()
  await page.getByRole('alertdialog').getByRole('button', { name: 'フォロー解除' }).click()
  await expect(page.getByText('「Go構文」のフォローを解除しました')).toBeVisible()
  await expect(entry.getByRole('button', { name: 'Go構文 をフォローする', exact: true })).toBeVisible()
  await page.goto('/edit')
  await expect(page.getByRole('button', { name: 'Go構文', exact: true })).toHaveCount(0)
})

test('the practice screen points to the catalog when there are no packs', async ({ page }) => {
  await page.goto('/play')
  await expect(page.getByText('まだパックがありません。公式パックを選ぶと、フォローしてすぐに練習が始まります。フォローはあとで解除できます。')).toBeVisible()
  await page.getByRole('link', { name: 'ほかの公式パックを見る' }).click()
  await expect(page).toHaveURL(/\/packs\/catalog$/)
})

test('a followed pack opened on its edit page has no form, only duplicate and unfollow', async ({ page }) => {
  await page.goto('/packs/catalog')
  await page.getByRole('button', { name: 'Go構文 をフォローする', exact: true }).click()
  await page.getByRole('link', { name: '開く Go構文' }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  const id = new URL(page.url()).searchParams.get('pack')!
  await page.goto(`/packs/edit?pack=${encodeURIComponent(id)}`)
  await expect(page.getByText('公式パックは編集できません')).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByRole('button', { name: '複製', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  const copy = page.locator('li[data-pack-id]', { has: page.getByRole('button', { name: 'Go構文（コピー）', exact: true }) })
  await expect(copy).toBeVisible()
  await expect(copy.getByText('公式', { exact: true })).toHaveCount(0)
  await page.goto(`/packs/edit?pack=${encodeURIComponent(id)}`)
  await page.getByRole('button', { name: 'フォロー解除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'フォロー解除する' }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await expect(page.getByRole('button', { name: 'Go構文', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Go構文（コピー）', exact: true })).toBeVisible()
})

test('a followed list opened by URL shows the notice, and /create does not offer the followed pack', async ({ page }) => {
  await page.goto('/packs/catalog')
  await page.getByRole('button', { name: 'Go構文 をフォローする', exact: true }).click()
  await page.getByRole('link', { name: '開く Go構文' }).click()
  await expect(page).toHaveURL(/\/edit\?pack=/)
  const packId = new URL(page.url()).searchParams.get('pack')!
  const listId = await page.locator('li[data-list-id]').first().getAttribute('data-list-id')
  await page.goto(`/edit?list=${encodeURIComponent(listId!)}`)
  await expect(page.getByText('公式パックは編集できません')).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)

  await page.goto(`/create?pack=${encodeURIComponent(packId)}`)
  // A followed pack takes no new lists, so the list is not added to it: it gets a pack of its own.
  await expect(page.getByRole('textbox').first()).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'パック', exact: true })).toHaveCount(0)
  await expect(page.getByText(/に追加します/)).toHaveCount(0)
})

test('several official packs are followed one after another without leaving the catalog', async ({ page }) => {
  await page.goto('/packs/catalog')
  for (const name of ['Go構文', 'Kotlin構文']) {
    await page.getByRole('button', { name: `${name} をフォローする`, exact: true }).click()
    await expect(page.getByText(`「${name}」をフォローしました`)).toBeVisible()
    await expect(page.getByRole('button', { name: `${name} のフォローを解除`, exact: true })).toBeVisible()
  }
  await expect(page).toHaveURL(/\/packs\/catalog$/)
  await page.goto('/edit')
  await expect(page.getByRole('button', { name: 'Go構文', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kotlin構文', exact: true })).toBeVisible()
})

test('an official pack page shows the pack and its words, and its button follows the pack and starts practice', async ({ page }) => {
  await page.goto('/packs/catalog')
  const entry = page.locator('li[data-catalog-id]', { has: page.getByRole('heading', { name: 'Go構文', exact: true }) })
  await entry.getByRole('link', { name: '詳しく見る Go構文' }).click()
  await expect(page).toHaveURL(/\/packs\/go-syntax$/)
  await expect(page).toHaveTitle('Go構文のタイピング練習 | Typle')
  await expect(page.getByRole('heading', { level: 1, name: 'Go構文のタイピング練習' })).toBeVisible()
  await expect(page.getByText('3リスト・109語')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Go構文（初級）' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'package main', exact: true })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'このパックで練習する' }).click()
  await expect(page).toHaveURL(/\/play\?list=/)
  await expect(page.getByRole('textbox', { name: '表示された文字を入力', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^単語リストを切り替える（現在: .*初級/ })).toBeVisible()

  // Once followed, the button goes straight to the pack, without following it twice.
  await page.goto('/packs/go-syntax')
  await page.getByRole('button', { name: 'このパックで練習する' }).click()
  await expect(page).toHaveURL(/\/play\?list=/)
  await page.goto('/packs/catalog')
  await expect(entry.getByRole('button', { name: 'フォロー中' })).toBeDisabled()
  await page.goto('/edit')
  await expect(page.getByRole('button', { name: 'Go構文', exact: true })).toHaveCount(1)
})

test('a pack page that does not exist is not found', async ({ page }) => {
  const response = await page.goto('/packs/no-such-pack')
  expect(response?.status()).toBe(404)
})
