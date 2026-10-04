"use client"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useErrorText } from '@/i18n/useErrorText'
import { AppError, type ErrorKey } from '../core/appError'
import { GUEST_ACCOUNT_ID } from '../plugins/storage/guest'
import { workspaceStore } from '../plugins/storage'
import { initialLists } from '../plugins/packs'

import type { PracticeDevice } from '../core/devices'
import { useSelectedProfile } from './profileSelection'
import { DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, type ProfileDraft, type ProfileSummary } from '../core/profiles'
import { type SavedWordList } from '../core/wordLists'
import { WorkspaceError, type WorkspaceState, type WorkspaceWrite } from '../core/workspaceStore'

type Change = Omit<WorkspaceWrite, 'revision' | 'accountId'>
export type WorkspaceUpdate = (change: (lists: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => Promise<boolean>
// The error is kept as caught and turned into text while rendering, so it follows a change of language.
type Failure = { reason: unknown; fallback: ErrorKey } | null

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
  const [failure, setFailure] = useState<Failure>(null)
  const t = useTranslations('errors')
  const tProfiles = useTranslations('profiles')
  const errorText = useErrorText()
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
    setFailure(null)
  }
  const state = useRef<WorkspaceState | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)

  const show = useCallback((data: WorkspaceState) => {
    state.current = data
    setDevices(data.devices)
    setProfiles(data.profiles)
    setLists(data.revision === 0 ? initialLists : data.lists)
  }, [])

  const load = useCallback(async () => {
    if (!accountId) return
    const currentGeneration = generation.current
    const store = workspaceStore(accountId)
    const data = await store.read(profileId)
    if (data.accountId !== accountId || currentGeneration !== generation.current) throw new AppError('accountChangedReopen')
    // The chosen profile was deleted on another screen: switching reloads the first profile.
    if (data.profileId !== profileId) { chooseProfile(data.profileId); return null }
    if (store.staleReads && state.current && state.current.revision > data.revision) return state.current
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
        if (active && data !== null) { setFailure(null); setReady(true) }
      }).catch(reason => {
        if (active) { setFailure({ reason, fallback: 'loadFailed' }); setReady(true) }
      })
    }
    const reload = () => refresh.current()
    const unsubscribe = workspaceStore(accountId).subscribe?.(reload)
    window.addEventListener('focus', reload)
    return () => {
      active = false
      refresh.current = () => {}
      generation.current = effectGeneration + 1
      unsubscribe?.()
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
      const request = change(previous, () => previous.revision === 0 && useDefaults ? initialLists : previous.lists)
      const data = await workspaceStore(accountId).write({ ...request, revision: previous.revision, accountId })
      if (currentGeneration !== generation.current || data.accountId !== accountId) throw new AppError('accountChanged')
      if (data.profileId !== profileId) chooseProfile(data.profileId)
      else { show(data); setFailure(null) }
      return true
    } catch (reason) {
      if (reason instanceof WorkspaceError && reason.status === 409 && currentGeneration === generation.current) {
        try { await load() } catch (refreshError) { reason = refreshError }
      }
      if (currentGeneration !== generation.current) return false
      setFailure({ reason, fallback: 'saveFailed' })
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

  // The first profile keeps its stored initial name until renamed; it is shown in the reader's language.
  const shownProfiles = useMemo(() => profiles.map(profile => profile.id === DEFAULT_PROFILE_ID && profile.name === DEFAULT_PROFILE_NAME
    ? { ...profile, name: tProfiles('defaultName') } : profile), [profiles, tProfiles])
  const loaded = status !== 'loading' && ready
  const error = failure ? errorText(failure.reason, t(failure.fallback)) : ''
  /** Which error is shown, for screens that place some errors next to a field. */
  const errorKey = failure?.reason instanceof AppError ? failure.reason.key : null
  return {
    lists, devices, accountId, profiles: shownProfiles, profileId,
    /** Where this workspace is saved; undefined until the login is known. */
    storage: accountId ? workspaceStore(accountId).location : undefined,
    profile: shownProfiles.find(profile => profile.id === profileId),
    selectProfile: (id: string) => { if (!busy.current) chooseProfile(id) },
    updateProfiles,
    updateDevices: (change: (current: PracticeDevice[]) => PracticeDevice[]) => update(current => current, true, change),
    ready: loaded, error, errorKey, saving, update, reload: load,
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
