import { test, expect } from '@playwright/test'
import { guestWorkspace } from './guestData'
import zsh from '../../src/plugins/packs/commands/macos-zsh-commands.json'

test('labels in a long pack chooser do not add blank space below the play page', async ({ page }) => {
  const lists = Array.from({ length: 40 }, (_, index) => ({
    id: `layout-${index}`, name: `Commands ${index}`, createdAt: '2026-09-01',
    category: 'プログラミング', tags: ['macOS', 'シェル'],
    words: index === 0 ? zsh.words : [{ display: 'pwd', input: 'pwd', annotation: '' }],
    records: [],
  }))
  await page.addInitScript(value => localStorage.setItem('typle-r:guest-workspace:v1', value), guestWorkspace(lists))

  for (const width of [1440, 1100, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/play?list=layout-0')
    const chooser = page.getByRole('list', { name: '単語リスト', exact: true })
    await expect(chooser.getByRole('button')).toHaveCount(40)
    await expect(chooser.locator('[data-list-labels]').first()).toContainText('カテゴリ')

    // Offscreen labels must stay inside the chooser's scroll area, including after scrolling it.
    const scrollBox = chooser.locator('..')
    expect(await scrollBox.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
    for (const bottom of [false, true]) {
      await scrollBox.evaluate((element, bottom) => { element.scrollTop = bottom ? element.scrollHeight : 0 }, bottom)
      const geometry = await page.evaluate(() => ({
        pageBottom: document.documentElement.scrollHeight,
        contentBottom: Math.max(innerHeight, document.body.getBoundingClientRect().bottom + scrollY),
      }))
      expect(geometry.pageBottom).toBeLessThanOrEqual(Math.ceil(geometry.contentBottom) + 1)
    }
  }
})
