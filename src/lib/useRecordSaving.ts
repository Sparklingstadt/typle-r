"use client"
import { randomId } from "../core/randomId"
import { useRef, useState } from 'react'
import type { PracticeDevice } from '../core/devices'
import type { SavedWordList } from '../core/wordLists'
import type { RecordSave } from './useWordLists'
import { makeRecord, type PracticeRecord } from '../core/records'
import { newSession, pauseSession, resumeSession, type TypingSession } from '../core/typing'

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

// The session and its record, shared by typing (usePractice) and writing (useWritingPractice): the device is taken as it
// is when the clock starts, and the finished run is saved once, with a retry that ignores answers for an older run.
export function useRecordSaving(list: SavedWordList | undefined, addRecord: RecordSave, device?: PracticeDevice, mode?: 'writing') {
  const [session, setSession] = useState(newSession)
  const [practiceDevice, setPracticeDevice] = useState<PracticeDevice | undefined>()
  const completedRecord = useRef<PracticeRecord | null>(null)
  const [record, setRecord] = useState<PracticeRecord | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  // Moves the session on; a finished one is recorded with the device it started with.
  function update(next: TypingSession) {
    const snapshot = session.startedAt === null ? (device ? { ...device } : undefined) : practiceDevice
    if (session.startedAt === null && next.startedAt !== null) setPracticeDevice(snapshot)
    setSession(next)
    if (next.finishedAt !== null && list) {
      const record = makeRecord(next, list.words.length, randomId(), snapshot, mode)
      completedRecord.current = record
      setRecord(record)
      saveRecord(record)
    }
  }

  function reset() {
    setSession(newSession())
    setPracticeDevice(undefined)
    completedRecord.current = null
    setRecord(null)
    setSaveState('idle')
  }

  // Whether this run has been recorded already; nothing more is judged after that.
  function completed() {
    return completedRecord.current !== null
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

  return { session, practiceDevice, record, saveState, update, reset, completed, pause, resume, retrySave }
}
