import { AppError } from './appError'
import type { PracticeDevice } from './devices'
import { DEFAULT_PROFILE_ID, type ProfileDraft, type ProfileSummary } from './profiles'
import type { SavedWordList } from './wordLists'
import { WorkspaceError, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from './workspaceStore'

type Change = Omit<WorkspaceWrite, 'revision' | 'accountId'>

/** What the screens show of the workspace. */
export type WorkspaceShown = { lists: SavedWordList[]; devices: PracticeDevice[]; profiles: ProfileSummary[] }

export type WorkspaceSessionOptions = {
  store: WorkspaceStore
  accountId: string
  profileId: string
  /** Shown until the first save, which keeps them as the account's own lists. */
  initialLists: SavedWordList[]
  show(shown: WorkspaceShown): void
  /** The store answered for another profile (the chosen one was deleted elsewhere, or a save switched away from it). */
  chooseProfile(profileId: string): void
  /** Whether a save is in progress. Not called after `close`. */
  saving(value: boolean): void
}

/**
 * Loads and saves one account's profile. Results that arrive after `close` (the account or profile changed) are
 * never shown, and only one save runs at a time.
 */
export function createWorkspaceSession({ store, accountId, profileId, initialLists, show, chooseProfile, saving }: WorkspaceSessionOptions) {
  let state: WorkspaceState | null = null
  let busy = false
  let closed = false

  function display(data: WorkspaceState) {
    state = data
    show({ lists: data.revision === 0 ? initialLists : data.lists, devices: data.devices, profiles: data.profiles })
  }

  /** Resolves null when the store chose another profile, which loads in a new session. */
  async function load(): Promise<WorkspaceState | null> {
    const data = await store.read(profileId)
    if (closed || data.accountId !== accountId) throw new AppError('accountChangedReopen')
    if (data.profileId !== profileId) { chooseProfile(data.profileId); return null }
    // A cloud read that started before a save can finish after it; keep the newer state.
    if (store.staleReads && state && state.revision > data.revision) return state
    display(data)
    return state
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
      if (data.profileId !== profileId) chooseProfile(data.profileId)
      else display(data)
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
    /** Replaces this profile's lists, and optionally the account's devices. */
    update(change: (current: SavedWordList[]) => SavedWordList[], useDefaults = true, changeDevices?: (current: PracticeDevice[]) => PracticeDevice[]) {
      return save((previous, currentLists) => ({ profileId: previous.profileId, lists: change(currentLists()),
        ...(changeDevices ? { devices: changeDevices(previous.devices) } : {}) }), useDefaults)
    },
    /** Adds, renames or deletes profiles. Deleting the profile in use switches to the first profile. */
    updateProfiles(change: (current: ProfileDraft[]) => ProfileDraft[]) {
      return save((previous, currentLists) => {
        const next = change(previous.profiles)
        return next.some(profile => profile.id === previous.profileId)
          ? { profileId: previous.profileId, profiles: next, lists: currentLists() }
          : { profileId: DEFAULT_PROFILE_ID, profiles: next }
      })
    },
    /** Stops showing results; the account or profile changed. */
    close() { closed = true },
  }
}

export type WorkspaceSession = ReturnType<typeof createWorkspaceSession>
