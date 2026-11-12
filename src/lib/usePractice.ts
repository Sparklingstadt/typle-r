"use client"
import { useEffect, useRef, useState } from 'react'
import type { PracticeDevice } from '../core/devices'
import type { SavedWordList } from '../core/wordLists'
import type { RecordSave } from './useWordLists'
import { sessionResult, revealAnswer, typeInput } from '../core/typing'
import type { PracticeMode } from '../core/records'
import { useRecordSaving } from './useRecordSaving'
import { useTypingOptions } from './inputSettings'

// What a review practises: the words missed in the run just finished, or the list's weak words (from the home screen).
export type ReviewKind = 'missed' | 'weak'

export function usePractice(wordLists: SavedWordList[], addRecord: RecordSave, device?: PracticeDevice, initialListId?: string | null, mode: PracticeMode = 'normal',
  initialReview?: { words: SavedWordList['words']; kind: ReviewKind }) {
  const [list, setList] = useState<SavedWordList | undefined>(() => {
    const found = wordLists.find(item => item.id === initialListId) ?? wordLists[0]
    return found && initialReview?.words.length ? { ...found, words: initialReview.words } : found
  })
  // A review practises only some words of the list and is not recorded.
  const [review, setReview] = useState<ReviewKind | null>(() => initialReview?.words.length ? initialReview.kind : null)
  const selected = wordLists.findIndex(item => item.id === list?.id)
  const { session, practiceDevice, practiceMode, record, saveState, update, reset, completed, pause, resume, retrySave } = useRecordSaving(list, addRecord, device, mode, review === null)
  const typingOptions = useTypingOptions()
  const [composition, setComposition] = useState<string | null>(null)
  const composing = useRef(false)
  const committedComposition = useRef<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const word = list?.words[session.index]
  const finished = session.finishedAt !== null
  const result = sessionResult(session)

  useEffect(() => { if (!finished) input.current?.focus() }, [finished, selected])

  // `words` starts a review of those words of the list instead of the whole list.
  function restart(index = selected, words?: SavedWordList['words'], kind: ReviewKind = 'missed') {
    const next = wordLists[index]
    setList(next && words ? { ...next, words } : next)
    setReview(words !== undefined ? kind : null)
    reset()
    setComposition(null)
    composing.current = false
    committedComposition.current = null
    input.current?.focus()
  }

  function enter(value: string) {
    if (completed()) return
    update(typeInput(session, list?.words ?? [], value, Date.now(), typingOptions))
  }

  // Recall mode: shows the rest of the current word, counting it as mistakes once. Revealing also starts the clock.
  function reveal() {
    if (completed()) return
    update(revealAnswer(session, list?.words ?? [], Date.now()))
    input.current?.focus()
  }

  function startComposition() {
    composing.current = true
    setComposition(session.input)
  }
  function endComposition(value: string) {
    composing.current = false
    committedComposition.current = value
    setComposition(null)
    enter(value)
  }
  function changeInput(value: string, isComposing: boolean) {
    if (composing.current || isComposing) setComposition(value)
    else {
      const duplicate = committedComposition.current === value
      committedComposition.current = null
      if (!duplicate) enter(value)
    }
  }
  return { list, review, selected, session, practiceDevice, practiceMode, composition, startComposition, endComposition, changeInput, record, saveState, input, word, finished, result, restart, retrySave, pause, resume, reveal }
}
