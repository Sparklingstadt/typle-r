import type { Page } from '@playwright/test'

/** Opens every pack on /edit, so the rows of the lists inside can be reached (a search or filter opens the matching ones itself). */
export async function openPacks(page: Page) {
  await page.locator('li[data-pack-id]').first().waitFor()
  const closed = page.locator('li[data-pack-id] h3 button[aria-expanded="false"]')
  while (await closed.count()) await closed.first().click()
}
