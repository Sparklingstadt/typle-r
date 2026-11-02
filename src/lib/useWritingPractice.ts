"use client"
import { randomId } from "../core/randomId"
import { useEffect, useRef, useState } from 'react'
import type { PracticeDevice } from '../core/devices'
import type { SavedWordList } from '../core/wordLists'
import type { RecordSave } from './useWordLists'
import { makeRecord, type PracticeRecord } from '../core/records'
import { newSession, pauseSession, resumeSession, sessionResult, type TypingSession } from '../core/typing'
import { judgeWriting, normalizeWriting, skipWord, startWriting } from '../core/writing'
import { useTypingOptions } from './inputSettings'

// Practice by the OS's handwriting input (pen panel, IME handwriting, handwriting keyboards) into a text field: every
// change outside IME composition is checked against the word's display, a match moves on, and Enter counts a mistake.
// Recording follows usePractice; the record is saved with mode 'writing'.
export function useWritingPractice(list: SavedWordList, addRecord: RecordSave, device?: PracticeDevice) {
  // The list is the one chosen for this run, so the mark (and its language) stays even if it is removed meanwhile.
  const language = list.writing?.language ?? 'en'
  const words = list.words
  const [session, setSession] = useState(newSession)
  const [practiceDevice, setPracticeDevice] = useState<PracticeDevice | undefined>()
  const typingOptions = useTypingOptions()
  const [value, setValue] = useState('')
  // What the last counted mistake read as, shown so the writer sees what the recognition made of it.
  const [read, setRead] = useState<string | null>(null)
  const composing = useRef(false)
  const committedComposition = useRef<string | null>(null)
  const completedRecord = useRef<PracticeRecord | null>(null)
  const [record, setRecord] = useState<PracticeRecord | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const input = useRef<HTMLInputElement>(null)
  const word = words[session.index]
  const finished = session.finishedAt !== null
  const result = sessionResult(session)

  useEffect(() => { if (!finished) input.current?.focus() }, [finished])

  function restart() {
    setSession(newSession())
    setPracticeDevice(undefined)
    setValue('')
    setRead(null)
    composing.current = false
    committedComposition.current = null
    completedRecord.current = null
    setRecord(null)
    setSaveState('idle')
    input.current?.focus()
  }

  function apply(next: TypingSession) {
    if (next === session) return
    const snapshot = session.startedAt === null ? (device ? { ...device } : undefined) : practiceDevice
    if (session.startedAt === null && next.startedAt !== null) setPracticeDevice(snapshot)
    setSession(next)
    if (next.index !== session.index || next.finishedAt !== null) {
      setValue('')
      setRead(null)
    }
    if (next.finishedAt !== null) {
      const record = makeRecord(next, words.length, randomId(), snapshot, 'writing')
      completedRecord.current = record
      setRecord(record)
      saveRecord(record)
    }
  }

  // Writing starts the clock; only text outside composition is judged, and a mismatch is not a mistake yet.
  function enter(text: string, judge: boolean) {
    if (completedRecord.current) return
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
    if (composing.current || completedRecord.current) return
    const next = judgeWriting(session, words, [value], Date.now(), language, typingOptions, true)
    if (next !== session && next.index === session.index && next.finishedAt === null) setRead(normalizeWriting(value, language))
    apply(next)
    input.current?.focus()
  }

  // Always possible while a word is current: counts a mistake and moves on, for words the recognition never gets.
  function skip() {
    if (completedRecord.current) return
    apply(skipWord(session, words, Date.now()))
    input.current?.focus()
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

  // The clock stops while the field has lost focus and runs again once it is back.
  function pause() {
    setSession(current => pauseSession(current, Date.now()))
  }
  function resume() {
    setSession(current => resumeSession(current, Date.now()))
  }

  function saveRecord(record: PracticeRecord) {
    setSaveState('saving')
    void addRecord(list.id, record).then(saved => {
      if (completedRecord.current === record) setSaveState(saved ? 'saved' : 'failed')
    })
  }
  function retrySave() {
    if (completedRecord.current) saveRecord(completedRecord.current)
  }

  return { language, session, practiceDevice, word, finished, result, record, saveState, input, value, read, change, submit, skip, startComposition, endComposition, pause, resume, restart, retrySave }
}
