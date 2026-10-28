import { AppError } from '../../core/appError'
import { applyChange, decodeDocument, type WorkspaceDocument } from '../../core/workspaceDocument'
import { LegacyProfileRequest, MAX_WORKSPACE_BYTES, validateWorkspaceRequest } from '../../core/workspaceRequest'
import { followOfficial } from '../../core/followedPacks'
import { decodeInterests } from '../../core/interests'
import { officialPacks } from '../packs/catalog'
import { addRecord } from '../../core/records'
import { WorkspaceError, type RecordAdd, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from '../../core/workspaceStore'

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
  if (raw === null) return { lists: [], packs: [], devices: [], interests: decodeInterests(undefined), revision: 0, legacy: false }
  try {
    if (bytes(raw) > MAX_GUEST_BYTES) throw new Error('Too large')
    const value = JSON.parse(raw)
    if (value.version !== 1 || value.accountId !== GUEST_ACCOUNT_ID) throw new Error('Invalid guest workspace')
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid revision')
    // Data saved before packs has none, which decodeDocument converts.
    const { lists, packs, devices, interests, legacy } = decodeDocument(value)
    return { lists, packs, devices, interests, legacy, revision: value.revision }
  } catch {
    throw new AppError('guestReadFailed')
  }
}

function store(storage: Storage, { lists, packs, devices, interests, revision }: Stored): WorkspaceState {
  const raw = JSON.stringify({ version: 1, accountId: GUEST_ACCOUNT_ID, revision, lists, packs, devices, interests })
  if (!Number.isSafeInteger(revision) || bytes(raw) > MAX_GUEST_BYTES) throw new AppError('guestQuotaExceeded')
  try { storage.setItem(GUEST_STORAGE_KEY, raw) }
  catch { throw new AppError('guestWriteFailed') }
  return { lists, packs, devices, interests, revision, accountId: GUEST_ACCOUNT_ID }
}

// The lists of removed profiles are merged once, with a new revision, as for an account.
// Followed packs are brought in line with the catalog on every read and write. A read that changes them does not save
// them; the next write does.
function followed<T extends { lists: Stored['lists']; packs: Stored['packs'] }>(state: T): T {
  return { ...state, ...followOfficial({ lists: state.lists, packs: state.packs }, officialPacks()) }
}

export function readGuestWorkspace(storage: Storage = localStorage): WorkspaceState {
  const { legacy, ...document } = readDocument(storage)
  if (legacy) return followed(store(storage, { ...document, revision: document.revision + 1 }))
  return followed({ ...document, accountId: GUEST_ACCOUNT_ID })
}

export function writeGuestWorkspace(request: WorkspaceWrite, storage: Storage = localStorage): WorkspaceState {
  if (request.accountId !== GUEST_ACCOUNT_ID) throw new AppError('storageChanged')
  const previous = readDocument(storage)
  if (previous.revision !== request.revision || previous.legacy) throw new WorkspaceError('conflict', 409)
  let change
  try { change = validateWorkspaceRequest(request) }
  catch (error) { throw error instanceof LegacyProfileRequest ? new WorkspaceError('conflict', 409) : error }
  if ((change.lists || change.packs) && bytes(JSON.stringify({ lists: change.lists, packs: change.packs })) > MAX_WORKSPACE_BYTES) throw new AppError('guestQuotaExceeded')
  return followed(store(storage, { ...applyChange(previous, change), revision: change.revision + 1 }))
}

// Adds a run as the account's /api/workspace/records does: on whatever is stored now, without a revision, and to the
// lists as a read shows them (followed packs in line with the catalog), where the run was practised.
export function addGuestRecord(request: RecordAdd, storage: Storage = localStorage): WorkspaceState {
  if (request.accountId !== GUEST_ACCOUNT_ID) throw new AppError('storageChanged')
  const { legacy, ...previous } = followed(readDocument(storage))
  const { document, added } = addRecord(previous, request.listId, request.record)
  if (!added && !legacy) return { ...previous, accountId: GUEST_ACCOUNT_ID }
  if (bytes(JSON.stringify({ lists: document.lists, packs: document.packs })) > MAX_WORKSPACE_BYTES) throw new AppError('guestQuotaExceeded')
  return followed(store(storage, { ...document, revision: previous.revision + 1 }))
}

// Serialize read/check/write across tabs where the Web Locks API is available.
function locked<T>(action: () => T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(GUEST_STORAGE_KEY, action)
  return Promise.resolve(action())
}

export async function saveGuestWorkspace(request: WorkspaceWrite) {
  return locked(() => writeGuestWorkspace(request))
}

/** The guest workspace in this browser's LocalStorage. */
export const guestStore: WorkspaceStore = {
  location: 'browser',
  read: async () => readGuestWorkspace(localStorage),
  write: saveGuestWorkspace,
  addRecord: request => locked(() => addGuestRecord(request)),
  staleReads: false,
  subscribe(onChange) {
    // `key` is null when another tab clears the whole storage.
    const changed = (event: StorageEvent) => { if (event.key === GUEST_STORAGE_KEY || event.key === null) onChange() }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  },
}
