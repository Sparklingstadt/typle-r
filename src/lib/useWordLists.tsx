"use client"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from '@/lib/session'
import { useTranslations } from 'next-intl'
import { useErrorText } from '@/i18n/useErrorText'
import { AppError, type ErrorKey } from '../core/appError'
import { GUEST_ACCOUNT_ID } from '../plugins/storage/guest'
import { workspaceStore } from '../plugins/storage'
import { initialLists } from '../plugins/packs'

import type { PracticeDevice } from '../core/devices'
import { type SavedWordList } from '../core/wordLists'
import { createWorkspaceSession, type WorkspaceSession } from '../core/workspaceSession'

export type WorkspaceUpdate = (change: (lists: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => Promise<boolean>
// The error is kept as caught and turned into text while rendering, so it follows a change of language.
type Failure = { reason: unknown; fallback: ErrorKey } | null

// One workspace state for the whole app, so every part of the screen shares the same data and saves.
function useWorkspace() {
  const { data: session, status } = useSession()
  const accountId = status === 'loading' ? undefined : session?.user?.id ?? GUEST_ACCOUNT_ID
  const pathname = usePathname()
  const [devices, setDevices] = useState<PracticeDevice[]>([])
  const [lists, setLists] = useState<SavedWordList[]>([])
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
    setDevices([])
    setReady(false)
    setFailure(null)
  }
  const workspace = useRef<WorkspaceSession | null>(null)
  const refresh = useRef(() => {})
  useEffect(() => {
    if (!accountId) return
    const current = createWorkspaceSession({
      store: workspaceStore(accountId), accountId, initialLists, saving: setSaving,
      show: shown => { setLists(shown.lists); setDevices(shown.devices) },
    })
    workspace.current = current
    let active = true
    refresh.current = () => {
      if (current.busy) return
      current.load().then(() => {
        if (active) { setFailure(null); setReady(true) }
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
  }, [accountId])
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
    lists, devices, accountId,
    /** Where this workspace is saved; undefined until the login is known. */
    storage: accountId ? workspaceStore(accountId).location : undefined,
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
