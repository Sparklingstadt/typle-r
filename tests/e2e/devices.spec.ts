import { test, expect, type Page } from '@playwright/test'
const key = 'typle-r:guest-workspace:v1'
const selectedKey = 'typle-r:device:guest:local'
const today = new Date().toISOString()
const mac = { id: 'mac', name: 'MacBook Air', layout: 'JIS' }
const pc = { id: 'pc', name: 'Desktop', layout: '' }

function seedGuest(page: Page, devices: unknown[], selected?: string) {
  const records = [
    { id: 'r1', time: 3, date: today, mistakes: 0, accuracy: 100, wordCount: 1, device: mac },
    { id: 'r2', time: 4, date: '2026-09-01T00:00:00.000Z', mistakes: 1, accuracy: 90, wordCount: 1, device: { ...mac, name: 'Old MacBook' } },
  ]
  const lists = [{ id: 'list', name: 'List', createdAt: '2026-09-01', words: [{ display: 'ab', input: 'ab', annotation: '' }], records }]
  return page.addInitScript(([key, value, selectedKey, selected]) => {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, value)
    if (selected) localStorage.setItem(selectedKey, selected)
  }, [key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists, devices }), selectedKey, selected ?? ''])
}

test('adding devices explains mistakes in place and remembers the device for this browser', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/devices')
  await expect(page.getByRole('heading', { name: '端末はまだ登録されていません', exact: true })).toBeVisible()
  await expect(page.getByText('このブラウザーに保存', { exact: true })).toBeVisible()
  // Before any device is registered, the built-in default is listed and in use, and cannot be edited or deleted.
  const defaultRow = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'デフォルト', exact: true }) })
  await expect(defaultRow).toContainText('使用中')
  await expect(defaultRow).toContainText('名前の変更と削除はできません。')
  await expect(defaultRow.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'このブラウザーで練習に使う端末' })).toContainText('デフォルト')
  const add = page.getByRole('button', { name: '端末を追加', exact: true })
  await add.click()
  const dialog = page.getByRole('dialog', { name: '端末を追加' })
  const name = dialog.getByRole('textbox', { name: '端末名', exact: true })
  await expect(name).toBeFocused()
  await name.fill('   ')
  await dialog.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(name).toHaveAccessibleDescription(/端末名を入力してください。/)
  await expect(name).toBeFocused()
  await name.fill('デフォルト')
  await dialog.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(name).toHaveAccessibleDescription(/「デフォルト」はすでに登録されています。/)
  // Escape discards the draft and returns focus to the button that opened the dialog.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(add).toBeFocused()

  await add.click()
  await name.fill('MacBook Air')
  await dialog.getByRole('textbox', { name: '配列・メモ（任意）', exact: true }).fill('JIS')
  await expect(dialog.getByRole('checkbox', { name: 'このブラウザーで練習に使う端末にする' })).toBeChecked()
  await name.press('Enter')
  await expect(dialog).toHaveCount(0)
  const current = page.getByRole('region', { name: 'このブラウザーで練習に使う端末' })
  await expect(current).toContainText('MacBook Air（JIS）')
  await expect(page.getByRole('listitem').filter({ hasText: 'MacBook Air' })).toContainText('使用中')
  await expect(defaultRow).not.toContainText('使用中')
  expect(await page.evaluate(key => localStorage.getItem(key), selectedKey)).not.toBe('')

  // A second device is not selected unless asked, and duplicate names are reported on the field.
  await page.getByRole('button', { name: '端末を追加', exact: true }).click()
  await expect(dialog.getByRole('checkbox', { name: 'このブラウザーで練習に使う端末にする' })).not.toBeChecked()
  await name.fill(' macbook air ')
  await dialog.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(name).toHaveAccessibleDescription(/「MacBook Air」はすでに登録されています。/)
  await name.fill('Desktop')
  await dialog.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: 'Desktop' })).not.toContainText('使用中')
  await expect(current).toContainText('MacBook Air（JIS）')
  expect(errors).toEqual([])
})

test('the device list shows usage, switches the practice device and keeps focus after deleting', async ({ page }) => {
  await seedGuest(page, [mac, pc], 'mac')
  await page.goto('/devices')
  const macRow = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'MacBook Air', exact: true }) })
  const pcRow = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Desktop', exact: true }) })
  // Both records count, including the one saved under the device's former name.
  await expect(macRow).toContainText('練習 2回 · 最終 今日')
  await expect(pcRow).toContainText('まだ練習していません')
  await expect(macRow).toContainText('使用中')

  await page.getByRole('button', { name: /このブラウザーで練習に使う端末を変更/ }).click()
  await page.getByRole('menuitemradio', { name: 'Desktop', exact: true }).click()
  await expect(pcRow).toContainText('使用中')
  await expect(macRow).not.toContainText('使用中')
  await page.goto('/play')
  await expect(page.getByRole('button', { name: '使用端末：Desktop', exact: true })).toBeVisible()

  await page.goto('/devices')
  await pcRow.getByRole('button', { name: 'Desktop を編集', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '端末を編集' })
  await expect(edit).not.toContainText('これまでの練習記録')
  await edit.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(pcRow.getByRole('button', { name: 'Desktop を編集', exact: true })).toBeFocused()

  await pcRow.getByRole('button', { name: 'Desktop を削除', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '端末「Desktop」を削除しますか？' })
  await expect(confirm).toContainText('この端末で練習した記録はありません。')
  await expect(confirm).toContainText('このブラウザーで練習に使う端末は「デフォルト」に戻ります。')
  await confirm.getByRole('button', { name: '削除する', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(pcRow).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '登録済みの端末', exact: true })).toBeFocused()
  await expect(page.getByRole('region', { name: 'このブラウザーで練習に使う端末' })).toContainText('デフォルト')
  expect(await page.evaluate(key => localStorage.getItem(key), selectedKey)).toBe('default')

  // 未選択 is still available, for practising without recording a device.
  await page.getByRole('button', { name: /このブラウザーで練習に使う端末を変更/ }).click()
  await page.getByRole('menuitemradio', { name: '未選択（端末を記録しない）', exact: true }).click()
  await expect(page.getByRole('region', { name: 'このブラウザーで練習に使う端末' })).toContainText('未選択')
  expect(await page.evaluate(key => localStorage.getItem(key), selectedKey)).toBe('')

  await macRow.getByRole('button', { name: 'MacBook Air を削除', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('この端末で練習した2回分の記録は削除されず、練習した時点の端末名のまま残ります。')
  await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(macRow.getByRole('button', { name: 'MacBook Air を削除', exact: true })).toBeFocused()

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('a full device list cannot grow and explains why', async ({ page }) => {
  await seedGuest(page, Array.from({ length: 100 }, (_, index) => ({ id: `d${index}`, name: `Device ${index}`, layout: '' })))
  await page.goto('/devices')
  await expect(page.getByRole('heading', { name: 'Device 99', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '端末を追加', exact: true })).toBeDisabled()
  await expect(page.getByText('端末は100台まで登録できます。使わなくなった端末を削除すると追加できます。')).toBeVisible()
})
