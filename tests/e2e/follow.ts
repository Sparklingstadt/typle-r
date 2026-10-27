import { expect, type Page } from '@playwright/test'

/**
 * Makes the guest one that has saved an empty library, as after unfollowing every official pack: since v0.100.0 a guest
 * with nothing saved starts following them all. Leaves a guest that has saved something as it is.
 */
export function startEmpty(page: Page) {
  return page.addInitScript(key => {
    if (localStorage.getItem(key) !== null) return
    localStorage.setItem(key, JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, lists: [], packs: [], devices: [], interests: [] }))
  }, 'typle-r:guest-workspace:v1')
}

/** Follows the given official packs from the catalog, starting from an empty library (see startEmpty). Ends on the pack list. */
export async function followPacks(page: Page, names: string[]) {
  await startEmpty(page)
  for (const name of names) {
    await page.goto('/packs/catalog')
    await page.getByRole('button', { name: `${name} をフォローする`, exact: true }).click()
    await expect(page).toHaveURL(/\/edit\?pack=/)
    await expect(page.getByText(`「${name}」をフォローしました`)).toBeVisible()
  }
}
