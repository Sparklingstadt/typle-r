import { AppError } from './appError'
import type { PracticeDevice } from './devices'
import type { SavedWordList } from './wordLists'
import { WorkspaceError, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from './workspaceStore'

type Change = Omit<WorkspaceWrite, 'revision' | 'accountId'>

/** What the screens show of the workspace. */
export type WorkspaceShown = { lists: SavedWordList[]; devices: PracticeDevice[] }

export type WorkspaceSessionOptions = {
  store: WorkspaceStore
  accountId: string
  /** Shown until the first save, which keeps them as the account's own lists. */
  initialLists: SavedWordList[]
  show(shown: WorkspaceShown): void
  /** Whether a save is in progress. Not called after `close`. */
  saving(value: boolean): void
}

/**
 * Loads and saves one account's workspace. Results that arrive after `close` (the account changed) are never shown,
 * and only one save runs at a time.
 */
export function createWorkspaceSession({ store, accountId, initialLists, show, saving }: WorkspaceSessionOptions) {
  let state: WorkspaceState | null = null
  let busy = false
  let closed = false

  function display(data: WorkspaceState) {
    state = data
    show({ lists: data.revision === 0 ? initialLists : data.lists, devices: data.devices })
  }

  async function load(): Promise<WorkspaceState> {
    const data = await store.read()
    if (closed || data.accountId !== accountId) throw new AppError('accountChangedReopen')
    // A lower revision than the one shown is the store's real state, e.g. after the browser's data was cleared.
    display(data)
    return data
  }

  /** Resolves false when nothing was saved without an error: nothing is loaded yet, a save is running, or the session closed. */
  async function save(change: (previous: WorkspaceState, currentLists: () => SavedWordList[]) => Change, useDefaults = true): Promise<boolean> {
    const previous = state
    if (closed || busy || !previous) return false
    busy = true
    saving(true)
    try {
      // The initial lists shown before the first save become real lists when anything is saved.
      const request = change(previous, () => previous.revision === 0 && useDefaults ? initialLists : previous.lists)
      const data = await store.write({ ...request, revision: previous.revision, accountId })
      if (closed || data.accountId !== accountId) throw new AppError('accountChanged')
      display(data)
      return true
    } catch (reason) {
      // Saved elsewhere first: show the latest so the next save starts from it.
      if (reason instanceof WorkspaceError && reason.status === 409 && !closed) {
        try { await load() } catch (loadError) { reason = loadError }
      }
      if (closed) return false
      throw reason
    } finally { if (!closed) { busy = false; saving(false) } }
  }

  return {
    load,
    save,
    get busy() { return busy },
    /** Replaces the lists, and optionally the devices. */
    update(change: (current: SavedWordList[]) => SavedWordList[], useDefaults = true, changeDevices?: (current: PracticeDevice[]) => PracticeDevice[]) {
      return save((previous, currentLists) => ({ lists: change(currentLists()),
        ...(changeDevices ? { devices: changeDevices(previous.devices) } : {}) }), useDefaults)
    },
    /** Stops showing results; the account changed. */
    close() { closed = true },
  }
}

export type WorkspaceSession = ReturnType<typeof createWorkspaceSession>
