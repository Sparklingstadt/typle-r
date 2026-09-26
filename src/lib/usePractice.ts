"use client"
import { randomId } from "./randomId"
import { useEffect, useRef, useState } from 'react'
import type { SavedWordList } from './wordLists'
import type { WorkspaceUpdate } from './workspaceClient'
import { addRecord, makeRecord, type PracticeRecord } from './records'
import { newSession, sessionResult, typeInput } from './typing'

export function usePractice(wordLists: SavedWordList[], update: WorkspaceUpdate) {
  const [list, setList] = useState<SavedWordList | undefined>(wordLists[0])
  const selected = wordLists.findIndex(item => item.id === list?.id)
  const [session, setSession] = useState(newSession)
  const [composition, setComposition] = useState<string | null>(null)
  const composing = useRef(false)
  const committedComposition = useRef<string | null>(null)
  const completedRecord = useRef<PracticeRecord | null>(null)
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const word = list?.words[session.index]
  const finished = session.finishedAt !== null
  const result = sessionResult(session)

  useEffect(() => { if (!finished) input.current?.focus() }, [finished, selected])

  function restart(index = selected) {
    setList(wordLists[index])
    setSession(newSession())
    setComposition(null)
    composing.current = false
    committedComposition.current = null
    completedRecord.current = null
    setSaved(false)
    input.current?.focus()
  }

  function enter(value: string) {
    if (completedRecord.current) return
    const next = typeInput(session, list?.words ?? [], value, Date.now())
    setSession(next)
    if (next.finishedAt !== null && list) {
      const record = makeRecord(next, list.words.length, randomId())
      completedRecord.current = record
      saveRecord(record)
    }
  }

  function saveRecord(record: PracticeRecord) {
    if (list) void update(current => addRecord(current, list.id, record)).then(value => {
      if (completedRecord.current === record) setSaved(value)
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
  return { list, selected, session, composition, startComposition, endComposition, changeInput, saved, input, word, finished, result, restart, retrySave }
}
