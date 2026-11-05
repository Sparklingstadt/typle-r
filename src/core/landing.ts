// Figures the landing page (/) shows about the official lists. Kept free of the UI so it can be unit-tested.

// The category names are data, written in the official lists as they are (see src/core/interests.ts).
export const PROGRAMMING_CATEGORY = 'プログラミング' // i18n-ignore
export const LANGUAGES_CATEGORY = '語学' // i18n-ignore

export type OfficialListCounts = { programming: number; languages: number; total: number }

export function officialListCounts(lists: readonly { category?: string }[]): OfficialListCounts {
  let programming = 0
  let languages = 0
  for (const list of lists) {
    if (list.category === PROGRAMMING_CATEGORY) programming++
    else if (list.category === LANGUAGES_CATEGORY) languages++
  }
  return { programming, languages, total: lists.length }
}
