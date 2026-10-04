"use client"
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { createWorkspaceSession, type WorkspaceSession } from '../core/workspaceSession'

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
  const workspace = useRef<WorkspaceSession | null>(null)
  const refresh = useRef(() => {})
  useEffect(() => {
    if (!accountId) return
    const current = createWorkspaceSession({
      store: workspaceStore(accountId), accountId, profileId, initialLists, chooseProfile, saving: setSaving,
      show: shown => { setLists(shown.lists); setDevices(shown.devices); setProfiles(shown.profiles) },
    })
    workspace.current = current
    let active = true
    refresh.current = () => {
      if (current.busy) return
      current.load().then(data => {
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
      current.close()
      workspace.current = null
      unsubscribe?.()
      window.removeEventListener('focus', reload)
    }
  }, [accountId, profileId, chooseProfile])
  // Each page opens with the latest data, as when every page loaded the workspace itself.
  useEffect(() => refresh.current(), [accountId, profileId, chooseProfile, pathname])

  async function save(action: (current: WorkspaceSession) => Promise<boolean>) {
    const current = workspace.current
    if (!ready || !current) return false
    try {
      const saved = await action(current)
      if (saved) setFailure(null)
      return saved
    } catch (reason) {
      setFailure({ reason, fallback: 'saveFailed' })
      return false
    }
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
    selectProfile: (id: string) => { if (!workspace.current?.busy) chooseProfile(id) },
    /** Adds, renames or deletes profiles. Deleting the profile in use switches this browser to the first profile. */
    updateProfiles: (change: (current: ProfileDraft[]) => ProfileDraft[]) => save(current => current.updateProfiles(change)),
    updateDevices: (change: (current: PracticeDevice[]) => PracticeDevice[]) => save(current => current.update(lists => lists, true, change)),
    update: (change: (current: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => save(current => current.update(change, useDefaults)),
    ready: loaded, error, errorKey, saving,
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
