"use client"
import { randomId } from "../core/randomId"
import { useEffect, useRef, useState } from 'react'
import type { PracticeDevice } from '../core/devices'
import type { SavedWordList } from '../core/wordLists'
import type { RecordSave } from './useWordLists'
import { makeRecord, type PracticeMode, type PracticeRecord } from '../core/records'
import { newSession, pauseSession, resumeSession, revealAnswer, sessionResult, typeInput, type TypingSession } from '../core/typing'
import { useTypingOptions } from './inputSettings'

export function usePractice(wordLists: SavedWordList[], addRecord: RecordSave, device?: PracticeDevice, initialListId?: string | null, mode: PracticeMode = 'normal') {
  const [list, setList] = useState<SavedWordList | undefined>(() => wordLists.find(item => item.id === initialListId) ?? wordLists[0])
  const selected = wordLists.findIndex(item => item.id === list?.id)
  const [practiceDevice, setPracticeDevice] = useState<PracticeDevice | undefined>()
  // The mode a started run is practised in; a change from another tab only applies to the next run.
  const [practiceMode, setPracticeMode] = useState<PracticeMode | undefined>()
  const [session, setSession] = useState(newSession)
  const typingOptions = useTypingOptions()
  const [composition, setComposition] = useState<string | null>(null)
  const composing = useRef(false)
  const committedComposition = useRef<string | null>(null)
  const completedRecord = useRef<PracticeRecord | null>(null)
  const [record, setRecord] = useState<PracticeRecord | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const input = useRef<HTMLInputElement>(null)
  const word = list?.words[session.index]
  const finished = session.finishedAt !== null
  const result = sessionResult(session)

  useEffect(() => { if (!finished) input.current?.focus() }, [finished, selected])

  function restart(index = selected) {
    setList(wordLists[index])
    setSession(newSession())
    setPracticeDevice(undefined)
    setPracticeMode(undefined)
    setComposition(null)
    composing.current = false
    committedComposition.current = null
    completedRecord.current = null
    setRecord(null)
    setSaveState('idle')
    input.current?.focus()
  }

  // Moves the session on; the device is fixed when the run starts and the record is saved when it finishes.
  function advance(next: TypingSession) {
    const snapshot = session.startedAt === null ? (device ? { ...device } : undefined) : practiceDevice
    const runMode = session.startedAt === null ? mode : practiceMode ?? mode
    if (session.startedAt === null && next.startedAt !== null) {
      setPracticeDevice(snapshot)
      setPracticeMode(runMode)
    }
    setSession(next)
    if (next.finishedAt !== null && list) {
      const record = makeRecord(next, list.words.length, randomId(), snapshot, runMode)
      completedRecord.current = record
      setRecord(record)
      saveRecord(record)
    }
  }

  function enter(value: string) {
    if (completedRecord.current) return
    advance(typeInput(session, list?.words ?? [], value, Date.now(), typingOptions))
  }

  // Recall mode: shows the rest of the current word, counting it as mistakes once. Revealing also starts the clock.
  function reveal() {
    if (completedRecord.current) return
    advance(revealAnswer(session, list?.words ?? [], Date.now()))
    input.current?.focus()
  }

  // The clock stops while the input has lost focus and runs again once it is back.
  function pause() {
    setSession(current => pauseSession(current, Date.now()))
  }
  function resume() {
    setSession(current => resumeSession(current, Date.now()))
  }

  function saveRecord(record: PracticeRecord) {
    if (!list) return
    setSaveState('saving')
    void addRecord(list.id, record).then(value => {
      if (completedRecord.current === record) setSaveState(value ? 'saved' : 'failed')
    })
  }
  function retrySave() {
    if (completedRecord.current) saveRecord(completedRecord.current)
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
  return { list, selected, session, practiceDevice, practiceMode, composition, startComposition, endComposition, changeInput, record, saveState, input, word, finished, result, restart, retrySave, pause, resume, reveal }
}
