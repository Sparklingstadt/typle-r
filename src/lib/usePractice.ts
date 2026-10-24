"use client"
import { randomId } from "../core/randomId"
import { useEffect, useRef, useState } from 'react'
import type { PracticeDevice } from '../core/devices'
import type { SavedWordList } from '../core/wordLists'
import type { WorkspaceUpdate } from './useWordLists'
import { addRecord, makeRecord, type PracticeRecord } from '../core/records'
import { newSession, pauseSession, resumeSession, sessionResult, typeInput } from '../core/typing'

export function usePractice(wordLists: SavedWordList[], update: WorkspaceUpdate, device?: PracticeDevice, initialListId?: string | null) {
  const [list, setList] = useState<SavedWordList | undefined>(() => wordLists.find(item => item.id === initialListId) ?? wordLists[0])
  const selected = wordLists.findIndex(item => item.id === list?.id)
  const [practiceDevice, setPracticeDevice] = useState<PracticeDevice | undefined>()
  const [session, setSession] = useState(newSession)
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
    setComposition(null)
    composing.current = false
    committedComposition.current = null
    completedRecord.current = null
    setRecord(null)
    setSaveState('idle')
    input.current?.focus()
  }

  function enter(value: string) {
    if (completedRecord.current) return
    const next = typeInput(session, list?.words ?? [], value, Date.now())
    const snapshot = session.startedAt === null ? (device ? { ...device } : undefined) : practiceDevice
    if (session.startedAt === null && next.startedAt !== null) setPracticeDevice(snapshot)
    setSession(next)
    if (next.finishedAt !== null && list) {
      const record = makeRecord(next, list.words.length, randomId(), snapshot)
      completedRecord.current = record
      setRecord(record)
      saveRecord(record)
    }
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
    void update(current => addRecord(current, list.id, record)).then(value => {
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
  return { list, selected, session, practiceDevice, composition, startComposition, endComposition, changeInput, record, saveState, input, word, finished, result, restart, retrySave, pause, resume }
}
