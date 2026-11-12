import { AppError, type ErrorKey } from '../../../core/appError'
import { ApiError, api } from '../../../core/api'
import { withoutFollowedWords } from '../../../core/followedPacks'
import { decodeDocument } from '../../../core/workspaceDocument'
import { followed } from '../official'
import { WorkspaceError, type RecordAdd, type RecordDelete, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from '../../../core/workspaceStore'

type Saved = { lists?: unknown; packs?: unknown; devices?: unknown; interests?: unknown; revision?: unknown; accountId?: unknown }

/** Sends a request to /api/workspace or /api/workspace/records and reads the workspace it answers with. */
async function requestWorkspace(path: string, method: 'GET' | 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<WorkspaceState> {
  let saved: Saved | null
  try {
    saved = await api<Saved | null>(path, { method, body })
  } catch (reason) {
    // The backend's error keys are those of the `errors` messages; one it did not name is shown as a failed request.
    if (reason instanceof ApiError) throw new WorkspaceError((reason.key ?? 'workspaceRequestFailed') as ErrorKey, reason.status)
    throw reason
  }
  if (!saved || typeof saved !== 'object' || !Number.isSafeInteger(saved.revision) || (saved.revision as number) < 0 || typeof saved.accountId !== 'string') {
    throw new AppError('invalidServerData')
  }
  // `packs` is null for an account that has saved nothing.
  const { lists, packs, devices, interests } = decodeDocument({ lists: saved.lists, packs: saved.packs, devices: saved.devices, interests: saved.interests })
  // Followed packs are saved without their words: the catalog gives them back.
  return followed({ accountId: saved.accountId, revision: saved.revision as number, lists, packs, devices, interests })
}

export function readWorkspace() {
  return requestWorkspace('/api/workspace', 'GET')
}

export function writeWorkspace(request: WorkspaceWrite) {
  // Followed packs' lists are sent without their words, as they are saved.
  const sent = request.lists && request.packs ? { ...request, ...withoutFollowedWords({ lists: request.lists, packs: request.packs }) } : request
  return requestWorkspace('/api/workspace', 'PUT', sent)
}

// POST answers with the workspace and the record as saved; the workspace is all the app needs.
export function addRecord(request: RecordAdd) {
  return requestWorkspace('/api/workspace/records', 'POST', request)
}

export function deleteRecord(request: RecordDelete) {
  return requestWorkspace('/api/workspace/records', 'DELETE', request)
}

/** The account's workspace on the server, through `/api/workspace`. */
export const cloudStore: WorkspaceStore = { location: 'account', read: readWorkspace, write: writeWorkspace, addRecord, deleteRecord, staleReads: true }
