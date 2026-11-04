"use client"
import { useState } from "react"
import { flushSync } from "react-dom"
import { arrayMove } from "@dnd-kit/sortable"
import { randomId } from "@/core/randomId"
import { AppError } from "@/core/appError"
import type { SavedWordList } from "@/core/wordLists"
import { MAX_WORDS, emptyWord, isFilledWord, normalizeWord, type DraftWord, type Word } from "@/core/wordDraft"
import type { ImportMode } from "@/components/WordListImport"

/** The words being edited and the operations on them. `focusWord` is called from event handlers and from `requestAnimationFrame`, so it need not be stable. */
export function useWordDraft(initial: SavedWordList | undefined, focusWord: (key: string) => void) {
  const [words, setWords] = useState<DraftWord[]>(() => (initial?.words ?? [emptyWord()]).map((word, index) => ({ ...normalizeWord(word), key: `initial-${index}` })))
  const filled = words.filter(isFilledWord)

  function add() {
    const key = randomId()
    flushSync(() => setWords(current => [...current, { ...emptyWord(), key }]))
    focusWord(key)
  }

  function moveTo(index: number, target: number) {
    if (target < 0 || target >= words.length || target === index) return
    setWords(current => arrayMove(current, index, target))
  }

  function remove(index: number) {
    if (words.length < 2) return
    const neighbor = words[index + 1] ?? words[index - 1]
    setWords(current => current.filter((_, position) => position !== index))
    // Wait for menus to close and return focus before moving it to the next word.
    requestAnimationFrame(() => focusWord(neighbor.key))
  }

  function update(key: string, change: Partial<Word>) {
    setWords(current => current.map(item => item.key === key ? { ...item, ...change } : item))
  }

  function reorder(activeKey: string, overKey: string) {
    setWords(current => {
      const from = current.findIndex(word => word.key === activeKey)
      const to = current.findIndex(word => word.key === overKey)
      return from < 0 || to < 0 ? current : arrayMove(current, from, to)
    })
  }

  /** Puts imported words in the draft and returns how many existing words stayed. */
  function load(imported: Word[], mode: ImportMode): number {
    const current = mode === "replace" ? [] : filled
    if (current.length + imported.length > MAX_WORDS) throw new AppError("importTooManyRows")
    setWords([...current, ...imported.map(word => ({ ...normalizeWord(word), key: randomId() }))])
    return current.length
  }

  return { words, filled, add, moveTo, remove, update, reorder, load }
}
