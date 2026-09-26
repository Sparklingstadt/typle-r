import { test, expect } from '@playwright/test'

for (const mobile of [false, true]) {
  test(`word dragging on create and edit (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let workspace = { accountId: 'drag-test', revision: 1, lists: [] as unknown[] }
    await page.route('**/api/auth/session', route => route.fulfill({ json: {
      user: { id: 'drag-test', name: 'Drag Test' }, expires: '2099-01-01T00:00:00Z',
    } }))
    await page.route('**/api/workspace', async route => {
      if (route.request().method() === 'PUT') workspace = { ...route.request().postDataJSON(), revision: workspace.revision + 1 }
      await route.fulfill({ json: workspace })
    })
    await page.goto('/create')
    await page.getByRole('textbox', { name: '単語リスト名', exact: true }).fill('Drag list')
    for (let i = 1; i <= 3; i++) {
      if (i > 1) await page.getByRole('button', { name: '単語を追加', exact: true }).click()
      await page.getByRole('textbox', { name: `表示する単語 ${i}`, exact: true }).fill(`Word ${i}`)
    }
    await page.getByRole('button', { name: '補足', exact: true }).first().click()
    await page.getByRole('textbox', { name: '補足 1', exact: true }).fill('Attached note')
    const handles = () => page.getByRole('button', { name: /をドラッグして並べ替え/ })
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
    await page.getByRole('button', { name: 'Drag list を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '表示する単語 3', exact: true })).toHaveValue('Word 1')
    await handles().first().focus()
    await page.keyboard.press('Space')
    await expect(handles().first()).toHaveAttribute('aria-pressed', 'true')
    // Allow the sensor's initial layout measurement to finish before moving.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.keyboard.press('ArrowDown', { delay: 100 })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue('Word 2')
    await handles().first().focus()
    await page.keyboard.press('Space')
    await expect(handles().first()).toHaveAttribute('aria-pressed', 'true')
    // Allow the sensor's initial layout measurement to finish before moving.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.keyboard.press('ArrowDown', { delay: 100 })
    await page.keyboard.press('Space')
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue('Word 3')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Drag list を編集', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '表示する単語 1', exact: true })).toHaveValue('Word 3')
    expect(errors).toEqual([])
  })
}
