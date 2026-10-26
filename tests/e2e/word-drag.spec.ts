import { test, expect } from '@playwright/test'
import { openPacks } from './packRows'

for (const mobile of [false, true]) {
  test(`word dragging on create and edit (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/create')
    await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Drag list')
    for (let i = 1; i <= 3; i++) {
      if (i > 1) await page.getByRole('button', { name: '単語を追加', exact: true }).click()
      await page.getByRole('textbox', { name: `表示する単語 ${i}`, exact: true }).fill(`Word ${i}`)
    }
    await page.getByRole('textbox', { name: '補足 1', exact: true }).fill('Attached note')
    const handles = () => page.getByRole('button', { name: /をドラッグして並べ替え/ })
    // A drop goes where the sensor last measured the dragged row to be, which can trail the key (a key pressed before the
    // rows are measured is ignored, and scrolling the row into view is measured a frame later). The row below moves up
    // once the dragged row is over it; until then, press again.
    const moveDown = () => expect(async () => {
      await page.keyboard.press('ArrowDown', { delay: 100 })
      await expect(page.getByRole('group', { name: '単語 2', exact: true })).toHaveAttribute('style', /translate3d\(0px, -[1-9]/, { timeout: 2000 })
    }).toPass()
    await handles().first().scrollIntoViewIfNeeded()
    const start = await handles().first().boundingBox()
    const end = await handles().nth(2).boundingBox()
    if (!start || !end) throw new Error('Missing handles')
    if (mobile) {
      const cdp = await page.context().newCDPSession(page)
      const x = start.x + start.width / 2
      const y = start.y + start.height / 2
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      for (let step = 1; step <= 20; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (end.y + end.height / 2 - y) * step / 20 }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await cdp.detach()
    } else {
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
      await page.mouse.down()
      await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 20 })
      await page.mouse.up()
    }
    await expect(page.getByRole('textbox', { name: '表示する単語 3', exact: true })).toHaveValue('Word 1')
    await expect(page.getByRole('textbox', { name: '補足 3', exact: true })).toHaveValue('Attached note')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/edit$/)
    await page.reload()
    await openPacks(page)
    await page.getByRole('button', { name: 'Drag list を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '表示する単語 3', exact: true })).toHaveValue('Word 1')
    await handles().first().focus()
    await page.keyboard.press('Space')
    await expect(handles().first()).toHaveAttribute('aria-pressed', 'true')
    await moveDown()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue('Word 2')
    await handles().first().focus()
    await page.keyboard.press('Space')
    await expect(handles().first()).toHaveAttribute('aria-pressed', 'true')
    await moveDown()
    await page.keyboard.press('Space')
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue('Word 3')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    // Until the save finishes the editor has unsaved changes, and leaving would ask first.
    await expect(page.getByRole('button', { name: 'Drag list を編集', exact: true })).toBeVisible()
    await page.reload()
    await openPacks(page)
    await page.getByRole('button', { name: 'Drag list を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue('Word 3')
    expect(errors).toEqual([])
  })
}
