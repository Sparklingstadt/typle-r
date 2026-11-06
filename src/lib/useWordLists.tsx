"use client"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from '@/lib/session'
import { useTranslations } from 'next-intl'
import { useErrorText } from '@/i18n/useErrorText'
import { AppError, type ErrorKey } from '../core/appError'
import { GUEST_ACCOUNT_ID } from '../plugins/storage/guest'
import { workspaceStore } from '../plugins/storage'
import { initialLibrary } from '../plugins/packs'

import type { PracticeDevice } from '../core/devices'
import { removeRecord, type PracticeRecord } from '../core/records'
import { type SavedWordList } from '../core/wordLists'
import type { Library, WordPack } from '../core/wordPacks'
import { createWorkspaceSession, type WorkspaceSession } from '../core/workspaceSession'
import { WorkspaceError } from '../core/workspaceStore'

export type RecordSave = (listId: string, record: PracticeRecord) => Promise<boolean>
// The error is kept as caught and turned into text while rendering, so it follows a change of language.
type Failure = { reason: unknown; fallback: ErrorKey } | null

// One workspace state for the whole app, so every part of the screen shares the same data and saves.
function useWorkspace() {
  const { data: session, status, update } = useSession()
  const accountId = status === 'loading' ? undefined : session?.user?.id ?? GUEST_ACCOUNT_ID
  const pathname = usePathname()
  const [devices, setDevices] = useState<PracticeDevice[]>([])
  const [lists, setLists] = useState<SavedWordList[]>([])
  const [packs, setPacks] = useState<WordPack[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [failure, setFailure] = useState<Failure>(null)
  const t = useTranslations('errors')
  const errorText = useErrorText()
  const [saving, setSaving] = useState(false)
  const [identity, setIdentity] = useState(accountId)
  // Reset before rendering a different account's view, rather than in an effect.
  if (identity !== accountId) {
    setIdentity(accountId)
    setSaving(false)
    setLists([])
    setPacks([])
    setInterests([])
    setDevices([])
    setReady(false)
    setFailure(null)
  }
  const workspace = useRef<WorkspaceSession | null>(null)
  const refresh = useRef(() => {})
  useEffect(() => {
    if (!accountId) return
    const current = createWorkspaceSession({
      store: workspaceStore(accountId), accountId, initialLibrary, saving: setSaving,
      show: shown => { setLists(shown.lists); setPacks(shown.packs); setDevices(shown.devices); setInterests(shown.interests) },
    })
    workspace.current = current
    let active = true
    refresh.current = () => {
      if (current.busy) return
      current.load().then(() => {
        if (active) { setFailure(null); setReady(true) }
      }).catch(reason => {
        if (active) { setFailure({ reason, fallback: 'loadFailed' }); setReady(true) }
        // The session ended elsewhere, such as by signing out of every device: read it again, so that the screen
        // shows it signed out instead of a cloud it can no longer reach.
        if (active && reason instanceof WorkspaceError && reason.status === 401) void update()
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
  }, [accountId, update])
  // Each page opens with the latest data, as when every page loaded the workspace itself.
  useEffect(() => refresh.current(), [accountId, pathname])

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

  const loaded = status !== 'loading' && ready
  const error = failure ? errorText(failure.reason, t(failure.fallback)) : ''
  /** Which error is shown, for screens that place some errors next to a field. */
  const errorKey = failure?.reason instanceof AppError ? failure.reason.key : null
  return {
    lists, packs, devices, interests, accountId,
    /** Where this workspace is saved; undefined until the login is known. */
    storage: accountId ? workspaceStore(accountId).location : undefined,
    updateDevices: (change: (current: PracticeDevice[]) => PracticeDevice[]) => save(current => current.update(lists => lists, true, change)),
    update: (change: (current: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => save(current => current.update(change, useDefaults)),
    /** Adds a finished practice run to a list, on its own: it is not refused for a list changed elsewhere. */
    addRecord: (listId: string, record: PracticeRecord) => save(current => current.addRecord(listId, record)),
    /** Deletes a saved run from a list: on its own by its id, or, for a run saved without one, by saving the lists
     * without it. */
    deleteRecord: (listId: string, record: SavedWordList['records'][number]) => record.id
      ? save(current => current.deleteRecord(listId, record.id!))
      : save(current => current.update(lists => removeRecord(lists, listId, record))),
    /** Replaces the interests; only they are saved. */
    updateInterests: (change: (current: string[]) => string[]) => save(current => current.updateInterests(change)),
    /** Replaces the library in its saved shape; for pack edits. */
    updateLibrary: (change: (current: Library) => Library, useDefaults?: boolean) => save(current => current.updateLibrary(change, useDefaults)),
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
