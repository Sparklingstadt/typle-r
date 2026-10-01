"use client"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { GUEST_ACCOUNT_ID, GUEST_STORAGE_KEY, readGuestWorkspace, saveGuestWorkspace } from './guestWorkspace'
import samples from '@/json/WordListsResponse.json'
import countries from '@/json/Countries.json'

import type { PracticeDevice } from './devices'
import { useSelectedProfile } from './profileSelection'
import { DEFAULT_PROFILE_ID, type ProfileDraft, type ProfileSummary } from './profiles'
import { type SavedWordList } from './wordLists'
import { readWorkspace, writeWorkspace, WorkspaceError, type WorkspaceState, type WorkspaceWrite } from './workspaceClient'

const defaults: SavedWordList[] = [...samples.map((list, index) => ({ ...list, id: `sample-${index + 1}`, records: [] })), countries]

type Change = Omit<WorkspaceWrite, 'revision' | 'accountId'>

// One workspace state for the whole app, so the profile switcher and the page share the same data and saves.
function useWorkspace() {
  const { data: session, status } = useSession()
  const accountId = status === 'loading' ? undefined : session?.user?.id ?? GUEST_ACCOUNT_ID
  const [profileId, chooseProfile] = useSelectedProfile(accountId)
  const pathname = usePathname()
  const [devices, setDevices] = useState<PracticeDevice[]>([])
  const [lists, setLists] = useState<SavedWordList[]>([])
  const [profiles, setProfiles] = useState<ProfileSummary[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const key = accountId && `${accountId}\n${profileId}`
  const [identity, setIdentity] = useState(key)
  // Reset before rendering a different account's or profile's view, rather than in an effect.
  if (identity !== key) {
    setIdentity(key)
    setSaving(false)
    setLists([])
    setDevices([])
    setProfiles([])
    setReady(false)
    setError('')
  }
  const state = useRef<WorkspaceState | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)

  const show = useCallback((data: WorkspaceState) => {
    state.current = data
    setDevices(data.devices)
    setProfiles(data.profiles)
    setLists(data.revision === 0 ? defaults : data.lists)
  }, [])

  const load = useCallback(async () => {
    if (!accountId) return
    const currentGeneration = generation.current
    const data = accountId === GUEST_ACCOUNT_ID ? readGuestWorkspace(localStorage, profileId) : await readWorkspace(profileId)
    if (data.accountId !== accountId || currentGeneration !== generation.current) throw new Error('ログイン状態が変わりました。画面を開き直してください。')
    // The chosen profile was deleted on another screen: switching reloads the first profile.
    if (data.profileId !== profileId) { chooseProfile(data.profileId); return null }
    if (accountId !== GUEST_ACCOUNT_ID && state.current && state.current.revision > data.revision) return state.current
    show(data)
    return state.current
  }, [accountId, profileId, chooseProfile, show])

  const refresh = useRef(() => {})
  useEffect(() => {
    const effectGeneration = ++generation.current
    state.current = null
    busy.current = false
    let active = true
    if (!accountId) return
    refresh.current = () => {
      if (busy.current) return
      load().then(data => {
        // null: switching to another profile, which loads again.
        if (active && data !== null) { setError(''); setReady(true) }
      }).catch(reason => {
        if (active) { setError(reason instanceof Error ? reason.message : '読み込みに失敗しました。'); setReady(true) }
      })
    }
    const reload = () => refresh.current()
    function storageChanged(event: StorageEvent) {
      if (accountId === GUEST_ACCOUNT_ID && (event.key === GUEST_STORAGE_KEY || event.key === null)) reload()
    }
    window.addEventListener('storage', storageChanged)
    window.addEventListener('focus', reload)
    return () => {
      active = false
      refresh.current = () => {}
      generation.current = effectGeneration + 1
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('focus', reload)
    }
  }, [load, accountId])
  // Each page opens with the latest data, as when every page loaded the workspace itself.
  useEffect(() => refresh.current(), [load, pathname])

  async function save(change: (previous: WorkspaceState, currentLists: () => SavedWordList[]) => Change, useDefaults = true): Promise<boolean> {
    const previous = state.current
    if (!ready || busy.current || !accountId || !previous || previous.accountId !== accountId || previous.profileId !== profileId) return false
    const currentGeneration = generation.current
    busy.current = true
    setSaving(true)
    try {
      // The samples shown before the first save become real lists when anything is saved.
      const request = change(previous, () => previous.revision === 0 && useDefaults ? defaults : previous.lists)
      const write = accountId === GUEST_ACCOUNT_ID ? saveGuestWorkspace : writeWorkspace
      const data = await write({ ...request, revision: previous.revision, accountId })
      if (currentGeneration !== generation.current || data.accountId !== accountId) throw new Error('ログイン状態が変わりました。')
      if (data.profileId !== profileId) chooseProfile(data.profileId)
      else { show(data); setError('') }
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

  function update(change: (current: SavedWordList[]) => SavedWordList[], useDefaults = true, changeDevices?: (current: PracticeDevice[]) => PracticeDevice[]) {
    return save((previous, currentLists) => ({ profileId: previous.profileId, lists: change(currentLists()),
      ...(changeDevices ? { devices: changeDevices(previous.devices) } : {}) }), useDefaults)
  }

  /** Adds, renames or deletes profiles. Deleting the profile in use switches this browser to the first profile. */
  function updateProfiles(change: (current: ProfileDraft[]) => ProfileDraft[]) {
    return save((previous, currentLists) => {
      const next = change(previous.profiles)
      return next.some(profile => profile.id === previous.profileId)
        ? { profileId: previous.profileId, profiles: next, lists: currentLists() }
        : { profileId: DEFAULT_PROFILE_ID, profiles: next }
    })
  }

  const loaded = status !== 'loading' && ready
  return {
    lists, devices, accountId, profiles, profileId,
    profile: profiles.find(profile => profile.id === profileId),
    selectProfile: (id: string) => { if (!busy.current) chooseProfile(id) },
    updateProfiles,
    updateDevices: (change: (current: PracticeDevice[]) => PracticeDevice[]) => update(current => current, true, change),
    ready: loaded, error, saving, update, reload: load,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>

const WorkspaceContext = createContext<Workspace | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return <WorkspaceContext.Provider value={useWorkspace()}>{children}</WorkspaceContext.Provider>
}

export function useWordLists() {
  const workspace = useContext(WorkspaceContext)
  if (!workspace) throw new Error('useWordLists must be used inside WorkspaceProvider')
  return workspace
}
