import { AppError, type ErrorKey } from '../../../core/appError'
import { decodeDocument } from '../../../core/workspaceDocument'
import { WorkspaceError, type RecordAdd, type RecordDelete, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from '../../../core/workspaceStore'

async function requestWorkspace(url: string, init?: RequestInit): Promise<WorkspaceState> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const data = await response.json()
  if (!response.ok) throw new WorkspaceError(typeof data.error === 'string' ? data.error as ErrorKey : 'workspaceRequestFailed', response.status)
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.accountId !== 'string') {
    throw new AppError('invalidServerData')
  }
  // `packs` is null for an account that has saved nothing.
  const { lists, packs, devices, interests } = decodeDocument({ lists: data.lists, packs: data.packs, devices: data.devices, interests: data.interests })
  return { accountId: data.accountId, revision: data.revision, lists, packs, devices, interests }
}

export function readWorkspace() {
  return requestWorkspace('/api/workspace')
}

export function writeWorkspace(request: WorkspaceWrite) {
  return requestWorkspace('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

export function addRecord(request: RecordAdd) {
  return requestWorkspace('/api/workspace/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

export function deleteRecord(request: RecordDelete) {
  return requestWorkspace('/api/workspace/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

/** The account's workspace on the server, through `/api/workspace`. */
export const cloudStore: WorkspaceStore = { location: 'account', read: readWorkspace, write: writeWorkspace, addRecord, deleteRecord, staleReads: true }
