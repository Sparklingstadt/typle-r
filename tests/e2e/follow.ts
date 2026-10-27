import { expect, type Page } from '@playwright/test'

/** Follows the given official packs from the catalog (accounts and guests start with no packs). Ends on the pack list. */
export async function followPacks(page: Page, names: string[]) {
  for (const name of names) {
    await page.goto('/packs/catalog')
    await page.getByRole('button', { name: `${name} をフォローする`, exact: true }).click()
    await expect(page).toHaveURL(/\/edit\?pack=/)
    await expect(page.getByText(`「${name}」をフォローしました`)).toBeVisible()
  }
}
