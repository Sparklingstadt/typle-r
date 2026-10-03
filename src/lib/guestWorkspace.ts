import { AppError } from './appError'
import { applyChange, decodeDocument, DEFAULT_PROFILE_ID, MissingProfileError, viewDocument, type WorkspaceDocument } from './profiles'
import { WorkspaceError, type WorkspaceState, type WorkspaceWrite } from './workspaceClient'
import { MAX_WORKSPACE_BYTES, validateWorkspaceRequest } from './workspaceRequest'

export const GUEST_ACCOUNT_ID = 'guest:local'
export const GUEST_STORAGE_KEY = 'typle-r:guest-workspace:v1'
// Each profile's lists have the same 1MB limit as the account; the whole store only has to fit the browser's quota.
const MAX_GUEST_BYTES = MAX_WORKSPACE_BYTES * 10

function bytes(value: string) {
  return new TextEncoder().encode(value).length
}

function readDocument(storage: Storage): WorkspaceDocument & { revision: number } {
  const raw = storage.getItem(GUEST_STORAGE_KEY)
  if (raw === null) return { ...decodeDocument({ lists: [], devices: [], profiles: [] }), revision: 0 }
  try {
    if (bytes(raw) > MAX_GUEST_BYTES) throw new Error('Too large')
    const value = JSON.parse(raw)
    if (value.version !== 1 || value.accountId !== GUEST_ACCOUNT_ID) throw new Error('Invalid guest workspace')
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid revision')
    return { ...decodeDocument(value), revision: value.revision }
  } catch {
    throw new AppError('guestReadFailed')
  }
}

export function readGuestWorkspace(storage: Storage = localStorage, profileId = DEFAULT_PROFILE_ID): WorkspaceState {
  const document = readDocument(storage)
  return { ...viewDocument(document, profileId), revision: document.revision, accountId: GUEST_ACCOUNT_ID }
}

export function writeGuestWorkspace(request: WorkspaceWrite, storage: Storage = localStorage): WorkspaceState {
  if (request.accountId !== GUEST_ACCOUNT_ID) throw new AppError('storageChanged')
  const previous = readDocument(storage)
  if (previous.revision !== request.revision) throw new WorkspaceError('conflict', 409)
  const { revision, ...change } = validateWorkspaceRequest(request)
  const tooLarge = () => new AppError('guestQuotaExceeded')
  if (change.lists && bytes(JSON.stringify(change.lists)) > MAX_WORKSPACE_BYTES) throw tooLarge()
  let next
  try { next = applyChange(previous, change) }
  catch (error) { throw error instanceof MissingProfileError ? new WorkspaceError(error.key, 409) : error }
  const raw = JSON.stringify({ version: 1, accountId: GUEST_ACCOUNT_ID, revision: revision + 1, ...next })
  if (!Number.isSafeInteger(revision + 1) || bytes(raw) > MAX_GUEST_BYTES) throw tooLarge()
  try { storage.setItem(GUEST_STORAGE_KEY, raw) }
  catch { throw new AppError('guestWriteFailed') }
  return { ...viewDocument(next, change.profileId), revision: revision + 1, accountId: GUEST_ACCOUNT_ID }
}

// Serialize read/check/write across tabs where the Web Locks API is available.
export async function saveGuestWorkspace(request: WorkspaceWrite) {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(GUEST_STORAGE_KEY, () => writeGuestWorkspace(request))
  }
  return writeGuestWorkspace(request)
}
