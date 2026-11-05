import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

// Titles reuse the words the screen already uses for itself (the sidebar link or the page heading),
// so every language gets a title without a second copy of the same text.
export const PAGE_TITLES = {
  home: "nav.links.home",
  play: "nav.links.play",
  records: "nav.links.records",
  rankings: "nav.links.rankings",
  edit: "nav.links.edit",
  words: "nav.links.words",
  devices: "nav.links.devices",
  interests: "nav.links.interests",
  createList: "wordLists.page.createTitle",
  catalog: "wordLists.catalog.title",
  createPack: "wordLists.packEditor.createTitle",
  editPack: "wordLists.packEditor.editTitle",
} as const

// Pages people may find through a search get their own description; the rest keep the site-wide one.
export const PAGE_DESCRIPTIONS: Partial<Record<keyof typeof PAGE_TITLES, string>> = {
  play: "metadata.playDescription",
  catalog: "wordLists.catalog.description",
}

export type PageKey = keyof typeof PAGE_TITLES

type Options = {
  // Pages that show only the visitor's own lists and records: a crawler would index an empty workspace.
  personal?: boolean
}

export async function pageMetadata(page: PageKey, { personal = false }: Options = {}): Promise<Metadata> {
  const t = await getTranslations()
  // The keys above are checked against the messages in every language by tests/pageMetadata.test.cjs.
  const message = (key: string) => t(key as Parameters<typeof t>[0])
  const metadata: Metadata = { title: `${message(PAGE_TITLES[page])} | Typle` }
  const description = PAGE_DESCRIPTIONS[page]
  if (description) metadata.description = message(description)
  if (personal) metadata.robots = { index: false, follow: true }
  return metadata
}
