import { AppError } from '../../core/appError'
import { applyChange, decodeDocument, type WorkspaceDocument } from '../../core/workspaceDocument'
import { MAX_WORKSPACE_BYTES, validateWorkspaceRequest } from '../../core/workspaceRequest'
import { withoutFollowedWords } from '../../core/followedPacks'
import { decodeInterests } from '../../core/interests'
import { followed } from './official'
import { addRecord, deleteRecord } from '../../core/records'
import { WorkspaceError, type RecordAdd, type RecordDelete, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from '../../core/workspaceStore'

export const GUEST_ACCOUNT_ID = 'guest:local'
export const GUEST_STORAGE_KEY = 'typle-r:guest-workspace:v1'
// Larger than the account's limit, so that a save near it still fits with the rest of the workspace.
const MAX_GUEST_BYTES = MAX_WORKSPACE_BYTES * 10

function bytes(value: string) {
  return new TextEncoder().encode(value).length
}

type Stored = WorkspaceDocument & { revision: number }

const empty = (revision: number): Stored => ({ lists: [], packs: [], devices: [], interests: decodeInterests(undefined), revision })

function readDocument(storage: Storage): Stored {
  const raw = storage.getItem(GUEST_STORAGE_KEY)
  if (raw === null) return empty(0)
  try {
    if (bytes(raw) > MAX_GUEST_BYTES) throw new Error('Too large')
    const value = JSON.parse(raw)
    if (value.version !== 1 || value.accountId !== GUEST_ACCOUNT_ID) throw new Error('Invalid guest workspace')
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid revision')
    // Data saved before v1.0.0, with profiles or without packs, is no longer read: the workspace is empty, and the next
    // save replaces it.
    if (value.profiles !== undefined || value.packs === undefined || value.packs === null) return empty(value.revision)
    const { lists, packs, devices, interests } = decodeDocument(value)
    return { lists, packs, devices, interests, revision: value.revision }
  } catch {
    throw new AppError('guestReadFailed')
  }
}

function store(storage: Storage, { lists, packs, devices, interests, revision }: Stored): WorkspaceState {
  const raw = JSON.stringify({ version: 1, accountId: GUEST_ACCOUNT_ID, revision, ...withoutFollowedWords({ lists, packs }), devices, interests })
  if (!Number.isSafeInteger(revision) || bytes(raw) > MAX_GUEST_BYTES) throw new AppError('guestQuotaExceeded')
  try { storage.setItem(GUEST_STORAGE_KEY, raw) }
  catch { throw new AppError('guestWriteFailed') }
  return { lists, packs, devices, interests, revision, accountId: GUEST_ACCOUNT_ID }
}

// Followed packs are brought in line with the catalog on every read and write (followed), and saved without their
// words (withoutFollowedWords). A read that changes them does not save them; the next write does.

export function readGuestWorkspace(storage: Storage = localStorage): WorkspaceState {
  return followed({ ...readDocument(storage), accountId: GUEST_ACCOUNT_ID })
}

export function writeGuestWorkspace(request: WorkspaceWrite, storage: Storage = localStorage): WorkspaceState {
  if (request.accountId !== GUEST_ACCOUNT_ID) throw new AppError('storageChanged')
  const previous = readDocument(storage)
  if (previous.revision !== request.revision) throw new WorkspaceError('conflict', 409)
  const change = validateWorkspaceRequest(request)
  if ((change.lists || change.packs) && bytes(JSON.stringify({ lists: change.lists, packs: change.packs })) > MAX_WORKSPACE_BYTES) throw new AppError('guestQuotaExceeded')
  return followed(store(storage, { ...applyChange(previous, change), revision: change.revision + 1 }))
}

// Adds a run as the account's /api/workspace/records does: on whatever is stored now, without a revision, and to the
// lists as a read shows them (followed packs in line with the catalog), where the run was practised.
export function addGuestRecord(request: RecordAdd, storage: Storage = localStorage): WorkspaceState {
  if (request.accountId !== GUEST_ACCOUNT_ID) throw new AppError('storageChanged')
  const previous = followed(readDocument(storage))
  const { document, added } = addRecord(previous, request.listId, request.record)
  if (!added) return { ...previous, accountId: GUEST_ACCOUNT_ID }
  if (bytes(JSON.stringify({ lists: document.lists, packs: document.packs })) > MAX_WORKSPACE_BYTES) throw new AppError('guestQuotaExceeded')
  return followed(store(storage, { ...document, revision: previous.revision + 1 }))
}

// Deletes a run as the account's /api/workspace/records does: on whatever is stored now, without a revision.
export function deleteGuestRecord(request: RecordDelete, storage: Storage = localStorage): WorkspaceState {
  if (request.accountId !== GUEST_ACCOUNT_ID) throw new AppError('storageChanged')
  const previous = followed(readDocument(storage))
  const { document, deleted } = deleteRecord(previous, request.listId, request.recordId)
  if (!deleted) return { ...previous, accountId: GUEST_ACCOUNT_ID }
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
  deleteRecord: request => locked(() => deleteGuestRecord(request)),
  staleReads: false,
  subscribe(onChange) {
    // `key` is null when another tab clears the whole storage.
    const changed = (event: StorageEvent) => { if (event.key === GUEST_STORAGE_KEY || event.key === null) onChange() }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  },
}
