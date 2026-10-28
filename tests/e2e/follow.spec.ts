import { test, expect } from '@playwright/test'

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
  await expect(page.getByText('まだパックがありません。公式パックをフォローするか、新しいパックを作りましょう')).toBeVisible()
  await page.getByRole('link', { name: '公式パックをフォローする' }).click()
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
  const select = page.locator('select')
  await expect(page.getByRole('textbox').first()).toBeVisible()
  if (await select.count()) await expect(select.locator('option', { hasText: 'Go構文' })).toHaveCount(0)
  await expect(select).not.toHaveValue(packId)
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
