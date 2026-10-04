import type { WordList } from './wordLists'

export type Word = WordList['words'][number]

/** Larger word files are refused before they are read. */
export const MAX_IMPORT_BYTES = 1024 * 1024

/** A file format a list's words are read from or written to, such as CSV. */
export interface WordFormat {
  /** The file extension, lower case and without the dot. */
  readonly extension: string
  readonly mimeType: string
  /** Throws an `AppError` naming the problem (and its line) when the text is not a valid word file. */
  parse?(text: string): Word[]
  /** Keeps exact typing strings, so `parse(encode(words))` returns the same words. */
  encode?(words: Word[]): string
}
