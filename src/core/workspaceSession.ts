import { AppError } from './appError'
import type { PracticeDevice } from './devices'
import type { SavedWordList } from './wordLists'
import { applyListChange, repairLibrary, viewLists, type Library, type WordPack } from './wordPacks'
import { WorkspaceError, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from './workspaceStore'

type Change = Omit<WorkspaceWrite, 'revision' | 'accountId'>

/** What the screens show of the workspace. */
export type WorkspaceShown = { lists: SavedWordList[]; packs: WordPack[]; devices: PracticeDevice[] }

export type WorkspaceSessionOptions = {
  store: WorkspaceStore
  accountId: string
  /** Shown while nothing is saved (revision 0), and saved with the first save. Empty since v0.98.0: packs are followed. */
  initialLibrary: Library
  show(shown: WorkspaceShown): void
  /** Whether a save is in progress. Not called after `close`. */
  saving(value: boolean): void
}

/**
 * Loads and saves one account's workspace. Results that arrive after `close` (the account changed) are never shown,
 * and only one save runs at a time.
 */
export function createWorkspaceSession({ store, accountId, initialLibrary, show, saving }: WorkspaceSessionOptions) {
  let state: WorkspaceState | null = null
  let busy = false
  let closed = false

  function display(data: WorkspaceState) {
    state = data
    const library = data.revision === 0 ? initialLibrary : data
    show({ lists: viewLists(library), packs: library.packs, devices: data.devices })
  }

  async function load(): Promise<WorkspaceState> {
    const data = await store.read()
    if (closed || data.accountId !== accountId) throw new AppError('accountChangedReopen')
    // A cloud read that started before a save can finish after it; keep the newer state.
    if (store.staleReads && state && state.revision > data.revision) return state
    display(data)
    return data
  }

  /** Resolves false when nothing was saved without an error: nothing is loaded yet, a save is running, or the session closed. */
  async function save(change: (previous: WorkspaceState, currentLibrary: () => Library) => Change, useDefaults = true): Promise<boolean> {
    const previous = state
    if (closed || busy || !previous) return false
    busy = true
    saving(true)
    try {
      // The initial library shown before the first save is what the first save starts from.
      const request = change(previous, () => previous.revision === 0 && useDefaults ? initialLibrary : previous)
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
    /** Replaces the lists (as screens see them, see `viewLists`), and optionally the devices. Packs follow the lists. */
    update(change: (current: SavedWordList[]) => SavedWordList[], useDefaults = true, changeDevices?: (current: PracticeDevice[]) => PracticeDevice[]) {
      return save((previous, currentLibrary) => {
        const library = currentLibrary()
        const { lists, packs } = applyListChange(library, change(viewLists(library)))
        return { lists, packs, ...(changeDevices ? { devices: changeDevices(previous.devices) } : {}) }
      }, useDefaults)
    },
    /** Replaces the library in its saved shape (packs and lists), repaired like any saved data. */
    updateLibrary(change: (current: Library) => Library, useDefaults = true) {
      return save((_previous, currentLibrary) => {
        const { lists, packs } = repairLibrary(change(currentLibrary()))
        return { lists, packs }
      }, useDefaults)
    },
    /** Stops showing results; the account changed. */
    close() { closed = true },
  }
}

export type WorkspaceSession = ReturnType<typeof createWorkspaceSession>
