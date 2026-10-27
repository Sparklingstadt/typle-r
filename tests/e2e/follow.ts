import { expect, type Page } from '@playwright/test'

/** Follows the given official packs from the catalog (accounts and guests start with no packs), one after another on
 * the catalog, which stays open after each. Ends on the pack list. */
export async function followPacks(page: Page, names: string[]) {
  await page.goto('/packs/catalog')
  for (const name of names) {
    await page.getByRole('button', { name: `${name} をフォローする`, exact: true }).click()
    await expect(page.getByText(`「${name}」をフォローしました`)).toBeVisible()
    await expect(page.getByRole('button', { name: `${name} のフォローを解除`, exact: true })).toBeVisible()
  }
  await expect(page).toHaveURL(/\/packs\/catalog$/)
  await page.goto('/edit')
}
