"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { GUEST_ACCOUNT_ID, GUEST_STORAGE_KEY, readGuestWorkspace, saveGuestWorkspace } from './guestWorkspace'
import samples from '@/json/WordListsResponse.json'
import countries from '@/json/Countries.json'

import type { PracticeDevice } from './devices'
import { type SavedWordList } from './wordLists'
import { readWorkspace, writeWorkspace, WorkspaceError, type WorkspaceState } from './workspaceClient'

const defaults: SavedWordList[] = [...samples.map((list, index) => ({ ...list, id: `sample-${index + 1}`, records: [] })), countries]
const changedEvent = 'typle-r:cloud-changed'

export function useWordLists() {
  const { data: session, status } = useSession()
  const accountId = status === 'loading' ? undefined : session?.user?.id ?? GUEST_ACCOUNT_ID
  const [devices, setDevices] = useState<PracticeDevice[]>([])
  const [lists, setLists] = useState<SavedWordList[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [identity, setIdentity] = useState(accountId)
  // Reset before rendering a different account's view, rather than in an effect.
  if (identity !== accountId) {
    setIdentity(accountId)
    setSaving(false)
    setLists([])
    setDevices([])
    setReady(false)
    setError('')
  }
  const state = useRef<WorkspaceState | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)

  const load = useCallback(async () => {
    if (!accountId) return
    const currentGeneration = generation.current
    const data = accountId === GUEST_ACCOUNT_ID ? readGuestWorkspace() : await readWorkspace()
    if (data.accountId !== accountId || currentGeneration !== generation.current) throw new Error('ログイン状態が変わりました。画面を開き直してください。')
    if (accountId !== GUEST_ACCOUNT_ID && state.current && state.current.revision > data.revision) return state.current
    state.current = data
    setDevices(data.devices)
    setLists(data.revision === 0 ? defaults : data.lists)
    return state.current
  }, [accountId])

  useEffect(() => {
    const effectGeneration = ++generation.current
    state.current = null
    busy.current = false
    let active = true
    if (!accountId) return
    function refresh() {
      if (busy.current) return
      load().then(() => { if (active) setError('') }).catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : '読み込みに失敗しました。')
      }).finally(() => { if (active) setReady(true) })
    }
    function storageChanged(event: StorageEvent) {
      if (accountId === GUEST_ACCOUNT_ID && (event.key === GUEST_STORAGE_KEY || event.key === null)) refresh()
    }
    refresh()
    window.addEventListener('storage', storageChanged)
    window.addEventListener('focus', refresh)
    window.addEventListener(changedEvent, refresh)
    return () => {
      active = false
      generation.current = effectGeneration + 1
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(changedEvent, refresh)
    }
  }, [load, accountId])

  async function update(change: (current: SavedWordList[]) => SavedWordList[], useDefaults = true, changeDevices?: (current: PracticeDevice[]) => PracticeDevice[]): Promise<boolean> {
    const previous = state.current
    if (!ready || busy.current || !accountId || !previous || previous.accountId !== accountId) return false
    const currentGeneration = generation.current
    busy.current = true
    setSaving(true)
    try {
      const next = change(previous.revision === 0 && useDefaults ? defaults : previous.lists)
      const write = accountId === GUEST_ACCOUNT_ID ? saveGuestWorkspace : writeWorkspace
      const data = await write({ lists: next, devices: changeDevices ? changeDevices(previous.devices) : previous.devices, revision: previous.revision, accountId })
      if (currentGeneration !== generation.current || data.accountId !== accountId) throw new Error('ログイン状態が変わりました。')
      state.current = data
      setLists(data.lists)
      setDevices(data.devices)
      setError('')
      window.dispatchEvent(new Event(changedEvent))
      return true
    } catch (reason) {
      if (reason instanceof WorkspaceError && reason.status === 409 && currentGeneration === generation.current) {
        try { await load() } catch (refreshError) { reason = refreshError }
      }
      if (currentGeneration !== generation.current) return false
      setError(reason instanceof Error ? reason.message : '保存に失敗しました。もう一度お試しください。')
      return false
    } finally { if (currentGeneration === generation.current) { busy.current = false; setSaving(false) } }
  }
  return { lists, devices, accountId, updateDevices: (change: (current: PracticeDevice[]) => PracticeDevice[]) => update(current => current, true, change), ready: status !== 'loading' && ready, error, saving, update, reload: load }
}
