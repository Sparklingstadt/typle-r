// The official packs that have a page of their own (/packs/<slug>) for people who find them through a search.
// The description is written by hand for each, in the language the packs' words are explained in.
import pages from './pages.json'
import { officialPacks, type OfficialPack } from './catalog'

export type OfficialPackPage = { slug: string; catalogId: string; description: string }

export const OFFICIAL_PACK_PAGES: readonly OfficialPackPage[] = pages

export type OfficialPackPageEntry = OfficialPackPage & { entry: OfficialPack }

export function officialPackPage(slug: string): OfficialPackPageEntry | null {
  const page = OFFICIAL_PACK_PAGES.find(item => item.slug === slug)
  const entry = page && officialPacks().find(item => item.catalogId === page.catalogId)
  return page && entry ? { ...page, entry } : null
}

export function officialPackPagePaths(): string[] {
  return OFFICIAL_PACK_PAGES.map(page => `/packs/${page.slug}`)
}
