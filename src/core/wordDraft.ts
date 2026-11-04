import type { SavedWordList, WritingLanguage } from "./wordLists"

export type Word = SavedWordList["words"][number]
export type DraftWord = Word & { key: string }
export const MAX_WORDS = 1000
export const emptyWord = (): Word => ({ display: "", input: "", annotation: "", input_type: "word" })
// An input equal to the display is shown as empty; saving uses the display for empty inputs.
export const normalizeWord = (word: Word): Word => ({ ...word, input: word.input === word.display ? "" : word.input, input_type: word.input_type ?? "word" })
export const draftSnapshot = (name: string, packId: string | null, levels: string[], writing: WritingLanguage | null, words: Word[]) =>
  JSON.stringify([name, packId, levels, writing, words.map(word => [word.display, word.input, word.annotation, word.input_type ?? "word"])])
// The recognition language a list starts with when the switch is turned on: the display language, or English when it has no counterpart.
export const WRITING_DEFAULTS: Record<string, WritingLanguage> = { ja: "ja", en: "en", fr: "fr", ru: "ru", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" }
export const isFilledWord = (word: Word) => !!(word.display || word.input || word.annotation)

/** The words as they are saved: without the row keys, and with the display for an empty input. */
export const savedWords = (words: DraftWord[]): Word[] => words.map(({ key, ...word }) => ({ ...word, input: word.input || word.display }))

export type DraftProblem = { field: "name" } | { field: "display" | "input"; key: string }

/** What keeps the draft from being saved: the name first, then at most one problem per word. */
export function draftProblems(name: string, words: DraftWord[]): DraftProblem[] {
  const problems: DraftProblem[] = []
  if (!name.trim()) problems.push({ field: "name" })
  for (const word of words) {
    if (!word.display.trim()) problems.push({ field: "display", key: word.key })
    else if (word.input && !word.input.trim()) problems.push({ field: "input", key: word.key })
  }
  return problems
}
