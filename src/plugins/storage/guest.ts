import { AppError } from '../../core/appError'
import { applyChange, decodeDocument, type WorkspaceDocument } from '../../core/workspaceDocument'
import { LegacyProfileRequest, MAX_WORKSPACE_BYTES, validateWorkspaceRequest } from '../../core/workspaceRequest'
import { WorkspaceError, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from '../../core/workspaceStore'

export const GUEST_ACCOUNT_ID = 'guest:local'
export const GUEST_STORAGE_KEY = 'typle-r:guest-workspace:v1'
// Data from when the guest could have 10 profiles, each with lists up to the account's 1MB limit, is still read.
const MAX_GUEST_BYTES = MAX_WORKSPACE_BYTES * 10

function bytes(value: string) {
  return new TextEncoder().encode(value).length
}

type Stored = WorkspaceDocument & { revision: number }

function readDocument(storage: Storage): Stored & { legacy: boolean } {
  const raw = storage.getItem(GUEST_STORAGE_KEY)
  if (raw === null) return { lists: [], devices: [], revision: 0, legacy: false }
  try {
    if (bytes(raw) > MAX_GUEST_BYTES) throw new Error('Too large')
    const value = JSON.parse(raw)
    if (value.version !== 1 || value.accountId !== GUEST_ACCOUNT_ID) throw new Error('Invalid guest workspace')
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid revision')
    const { lists, devices, legacy } = decodeDocument(value)
    return { lists, devices, legacy, revision: value.revision }
  } catch {
    throw new AppError('guestReadFailed')
  }
}

function store(storage: Storage, { lists, devices, revision }: Stored): WorkspaceState {
  const raw = JSON.stringify({ version: 1, accountId: GUEST_ACCOUNT_ID, revision, lists, devices })
  if (!Number.isSafeInteger(revision) || bytes(raw) > MAX_GUEST_BYTES) throw new AppError('guestQuotaExceeded')
  try { storage.setItem(GUEST_STORAGE_KEY, raw) }
  catch { throw new AppError('guestWriteFailed') }
  return { lists, devices, revision, accountId: GUEST_ACCOUNT_ID }
}

// The lists of removed profiles are merged once, with a new revision, as for an account.
export function readGuestWorkspace(storage: Storage = localStorage): WorkspaceState {
  const { legacy, ...document } = readDocument(storage)
  if (legacy) return store(storage, { ...document, revision: document.revision + 1 })
  return { ...document, accountId: GUEST_ACCOUNT_ID }
}

export function writeGuestWorkspace(request: WorkspaceWrite, storage: Storage = localStorage): WorkspaceState {
  if (request.accountId !== GUEST_ACCOUNT_ID) throw new AppError('storageChanged')
  const previous = readDocument(storage)
  if (previous.revision !== request.revision || previous.legacy) throw new WorkspaceError('conflict', 409)
  let change
  try { change = validateWorkspaceRequest(request) }
  catch (error) { throw error instanceof LegacyProfileRequest ? new WorkspaceError('conflict', 409) : error }
  if (change.lists && bytes(JSON.stringify(change.lists)) > MAX_WORKSPACE_BYTES) throw new AppError('guestQuotaExceeded')
  return store(storage, { ...applyChange(previous, change), revision: change.revision + 1 })
}

// Serialize read/check/write across tabs where the Web Locks API is available.
export async function saveGuestWorkspace(request: WorkspaceWrite) {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(GUEST_STORAGE_KEY, () => writeGuestWorkspace(request))
  }
  return writeGuestWorkspace(request)
}

/** The guest workspace in this browser's LocalStorage. */
export const guestStore: WorkspaceStore = {
  location: 'browser',
  read: async () => readGuestWorkspace(localStorage),
  write: saveGuestWorkspace,
  staleReads: false,
  subscribe(onChange) {
    // `key` is null when another tab clears the whole storage.
    const changed = (event: StorageEvent) => { if (event.key === GUEST_STORAGE_KEY || event.key === null) onChange() }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  },
}
