"use client"
import { useState } from 'react'
import type { SavedWordList } from '../core/wordLists'
import type { WritingChoice } from './writingMode'

type PendingSwitch = { kind: 'list'; index: number } | { kind: 'mode'; mode: WritingChoice }

export function usePracticeSwitch({ wordLists, selected, running, currentChoice, onSwitchList, onChooseWriting }: {
  wordLists: SavedWordList[]
  selected: number
  running: boolean
  currentChoice: WritingChoice
  onSwitchList: (index: number) => void
  onChooseWriting: (choice: WritingChoice) => void
}) {
  // A run in progress is only left after asking: for another list, or for typing instead of handwriting or back.
  const [pending, setPending] = useState<PendingSwitch | null>(null)
  // Counts the switches given up on, so the choosers let go of the levels chosen for them.
  const [cancels, setCancels] = useState(0)

  function requestList(id: string) {
    const index = wordLists.findIndex(item => item.id === id)
    if (index < 0) return
    if (!running) onSwitchList(index)
    else if (index !== selected) setPending({ kind: 'list', index })
  }
  // Choosing typing or handwriting starts the list again in that mode; during a run it asks first, as switching lists does.
  function requestWriting(next: WritingChoice) {
    if (next === currentChoice) return
    if (running) setPending({ kind: 'mode', mode: next })
    else onChooseWriting(next)
  }
  function confirm() {
    if (pending?.kind === 'list') onSwitchList(pending.index)
    else if (pending?.kind === 'mode') onChooseWriting(pending.mode)
  }
  // The dialog also closes after the confirm button, so this runs on both paths.
  function cancel() {
    setPending(null)
    setCancels(count => count + 1)
  }

  return { pending, cancels, requestList, requestWriting, confirm, cancel }
}
