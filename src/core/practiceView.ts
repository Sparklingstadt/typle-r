import { matchesFilter } from './listOverview'
import { matchesPackQuery, type PackOverview } from './packEditing'
import type { PracticeMode } from './records'
import type { Word } from './wordDraft'

// The packs of `category` (null for every category) that `query` finds, in the order given.
export function matchingPacks(items: PackOverview[], category: string | null, query: string) {
  return items.filter(item => matchesFilter(item.pack, { category, tags: [] }) && matchesPackQuery(item, query))
}

// The next words shown after the current one (at most three), and how many more follow them.
export function upcomingWords(words: Word[], index: number) {
  const next = words.slice(index + 1, index + 4)
  const remaining = words.length - index - 1 - next.length
  return { next, remaining }
}

export function oneLineDisplay(word: Word) {
  return word.input_type === 'code' ? word.display.replace(/\r\n|\r|\n/g, '  ') : word.display
}

export function isParagraphWord(word: Word) {
  return word.input_type !== 'code' && (Array.from(word.display).length > 24 || word.display.includes('\n'))
}

// Handwriting takes over the card; otherwise a started run keeps the mode it began in, like its device, and the
// recall choice applies from the next run. Handwriting never combines with recall.
export function currentMode(choice: 'normal' | 'writing', started: boolean, runMode: PracticeMode | null | undefined, chosen: PracticeMode): PracticeMode {
  return choice === 'writing' ? 'writing' : started ? runMode ?? chosen : chosen
}
