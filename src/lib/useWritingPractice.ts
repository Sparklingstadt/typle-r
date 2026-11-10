"use client"
import { useEffect, useRef, useState } from 'react'
import type { PracticeDevice } from '../core/devices'
import type { SavedWordList } from '../core/wordLists'
import type { RecordSave } from './useWordLists'
import { sessionResult, type TypingSession } from '../core/typing'
import { judgeWriting, normalizeWriting, skipWord, startWriting } from '../core/writing'
import { useRecordSaving } from './useRecordSaving'
import { useTypingOptions } from './inputSettings'

// Practice by the OS's handwriting input (pen panel, IME handwriting, handwriting keyboards) into a text field: every
// change outside IME composition is checked against the word's display, a match moves on, and Enter counts a mistake.
// For languages the app reads itself, the handwriting pad (HandwritingPad) reports its readings through write().
// The record is saved with mode 'writing'. A new run remounts the screen, so there is no restart here.
export function useWritingPractice(list: SavedWordList, addRecord: RecordSave, device?: PracticeDevice, recording = true) {
  // The list is the one chosen for this run, so the mark (and its language) stays even if it is removed meanwhile.
  const language = list.writing?.language ?? 'en'
  const words = list.words
  const { session, practiceDevice, record, saveState, update, completed, pause, resume, retrySave } = useRecordSaving(list, addRecord, device, 'writing', recording)
  const typingOptions = useTypingOptions()
  const [value, setValue] = useState('')
  // What the last counted mistake read as, shown so the writer sees what the recognition made of it.
  const [read, setRead] = useState<string | null>(null)
  const composing = useRef(false)
  const committedComposition = useRef<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const word = words[session.index]
  const finished = session.finishedAt !== null
  const result = sessionResult(session)

  useEffect(() => { if (!finished) input.current?.focus() }, [finished])

  function apply(next: TypingSession) {
    if (next === session) return
    if (next.index !== session.index || next.finishedAt !== null) {
      setValue('')
      setRead(null)
    }
    update(next)
  }

  // Writing starts the clock; only text outside composition is judged, and a mismatch is not a mistake yet.
  function enter(text: string, judge: boolean) {
    if (completed()) return
    const now = Date.now()
    const started = text && session.startedAt === null ? startWriting(session, now) : session
    apply(judge ? judgeWriting(started, words, [text], now, language, typingOptions, false) : started)
  }

  function change(text: string, isComposing = false) {
    if (composing.current || isComposing) {
      setValue(text)
      enter(text, false)
      return
    }
    // Some browsers send the committed text once more after compositionend, which was judged already.
    const duplicate = committedComposition.current === text
    committedComposition.current = null
    if (duplicate) return
    setValue(text)
    enter(text, true)
  }

  // Enter or 判定: a mismatch counts one mistake and leaves the text to correct. Nothing happens while composing.
  function submit() {
    if (composing.current || completed()) return
    const next = judgeWriting(session, words, [value], Date.now(), language, typingOptions, true)
    if (next !== session && next.index === session.index && next.finishedAt === null) setRead(normalizeWriting(value, language))
    apply(next)
    input.current?.focus()
  }

  // Always possible while a word is current: counts a mistake and moves on, for words the recognition never gets.
  function skip() {
    if (completed()) return
    apply(skipWord(session, words, Date.now()))
    input.current?.focus()
  }

  // The handwriting pad: the first stroke starts the clock; a reading is judged like the field's text, and an explicit
  // one (判定) counts a mistake when it does not match, as Enter does.
  function startPad() {
    if (completed() || session.startedAt !== null) return
    update(startWriting(session, Date.now()))
  }
  function write(text: string, explicit: boolean) {
    if (completed()) return
    const now = Date.now()
    const started = text && session.startedAt === null ? startWriting(session, now) : session
    setValue(text)
    const next = judgeWriting(started, words, [text], now, language, typingOptions, explicit)
    if (next.mistakes > session.mistakes && next.index === session.index) setRead(normalizeWriting(text, language))
    apply(next)
  }

  function startComposition() {
    composing.current = true
  }
  function endComposition(text: string) {
    composing.current = false
    committedComposition.current = text
    setValue(text)
    enter(text, true)
  }

  return { language, session, practiceDevice, word, finished, result, record, saveState, input, value, read, change, submit, skip, startComposition, endComposition, startPad, write, pause, resume, retrySave }
}
