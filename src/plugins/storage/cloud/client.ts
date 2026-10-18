import { AppError, type ErrorKey } from '../../../core/appError'
import { decodeDevices } from '../../../core/devices'
import { decodeSharedList } from '../../../core/sharedLists'
import { decodeLists } from '../../../core/wordLists'
import { WorkspaceError, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from '../../../core/workspaceStore'

async function requestWorkspace(url: string, init?: RequestInit): Promise<WorkspaceState> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const data = await response.json()
  if (!response.ok) throw new WorkspaceError(typeof data.error === 'string' ? data.error as ErrorKey : 'workspaceRequestFailed', response.status)
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.accountId !== 'string') {
    throw new AppError('invalidServerData')
  }
  // A server from before profiles were removed (e.g. while a deployment is switching over) answers with the first
  // profile's lists, which is what it saves when no profile is named.
  const lists = decodeLists(JSON.stringify({ version: 1, lists: data.lists }))
  return { accountId: data.accountId, revision: data.revision, devices: decodeDevices(data.devices ?? []), lists }
}

export function readWorkspace() {
  return requestWorkspace('/api/workspace')
}

export function writeWorkspace(request: WorkspaceWrite) {
  return requestWorkspace('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

/** The account's workspace on the server, through `/api/workspace`. */
export const cloudStore: WorkspaceStore = { location: 'account', read: readWorkspace, write: writeWorkspace, staleReads: true }

/** The list behind a share link. No login is needed; a list that is no longer shared rejects with `sharedListNotFound`. */
export async function readSharedList(id: string) {
  const response = await fetch(`/api/shared/${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (response.status === 404) throw new AppError('sharedListNotFound')
  if (!response.ok) throw new AppError('workspaceRequestFailed')
  return decodeSharedList(await response.json())
}
