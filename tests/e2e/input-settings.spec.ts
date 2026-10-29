import { test, expect } from '@playwright/test'
import { guestWorkspace } from './guestData'
const key = 'typle-r:guest-workspace:v1'

test('simple special-character input lets plain letters stand for accented ones in practice', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const lists = [{ id: 'spanish', name: 'Spanish', createdAt: '2026-09-01', words: [{ display: 'día', input: 'día', annotation: '' }], records: [] }]
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) }, [key, guestWorkspace(lists)])

  // Off by default: the accent must be typed.
  await page.goto('/play')
  const input = page.getByRole('textbox', { name: '表示された文字を入力', exact: true })
  await input.pressSequentially('di')
  await expect(input).toHaveValue('d')

  await page.goto('/home')
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '入力' }).click()
  await expect(page).toHaveURL(/\/input$/)
  await expect(page.getByRole('heading', { level: 1, name: '入力' })).toBeVisible()
  const toggle = page.getByRole('switch', { name: '特殊文字の簡易入力を使う' })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await page.reload()
  await expect(page.getByRole('switch', { name: '特殊文字の簡易入力を使う' })).toBeChecked()

  await page.goto('/play')
  await input.pressSequentially('di')
  await expect(input).toHaveValue('dí')
  await input.pressSequentially('a')
  const result = page.getByLabel('練習結果', { exact: true })
  await expect(result).toContainText('ミス 0 文字')
  await expect(result).toContainText('100%')
  expect(errors).toEqual([])
})
