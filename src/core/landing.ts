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

/**
 * A word's meaning, shown next to it: its annotation, without the word itself when the annotation starts with it
 * ("apple / りんご" for "apple" gives "りんご").
 */
export function wordMeaning(display: string, annotation: string): string {
  const note = annotation.trim()
  const rest = display && note.startsWith(display) ? note.slice(display.length) : ''
  return /^\s*\//.test(rest) ? rest.replace(/^\s*\/\s*/, '').trim() : note
}
