import { AppError, type ErrorKey } from '../../../core/appError'
import { decodeDevices } from '../../../core/devices'
import { decodeProfileSummaries, DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME } from '../../../core/profiles'
import { decodeLists } from '../../../core/wordLists'
import { WorkspaceError, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from '../../../core/workspaceStore'

async function requestWorkspace(url: string, init?: RequestInit): Promise<WorkspaceState> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const data = await response.json()
  if (!response.ok) throw new WorkspaceError(typeof data.error === 'string' ? data.error as ErrorKey : 'workspaceRequestFailed', response.status)
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.accountId !== 'string') {
    throw new AppError('invalidServerData')
  }
  const lists = decodeLists(JSON.stringify({ version: 1, lists: data.lists }))
  // A server from before profiles (e.g. while a deployment is switching over) has only the first profile.
  const legacy = data.profiles === undefined
  const profiles = legacy ? [{ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, listCount: lists.length,
    recordCount: lists.reduce((total, list) => total + list.records.length, 0) }] : decodeProfileSummaries(data.profiles)
  const profileId = legacy ? DEFAULT_PROFILE_ID : data.profileId
  if (!profiles.some(profile => profile.id === profileId)) throw new AppError('invalidServerData')
  return { accountId: data.accountId, revision: data.revision, devices: decodeDevices(data.devices ?? []), profiles, profileId, lists }
}

export function readWorkspace(profileId: string) {
  return requestWorkspace(profileId === DEFAULT_PROFILE_ID ? '/api/workspace' : `/api/workspace?${new URLSearchParams({ profile: profileId })}`)
}

export function writeWorkspace(request: WorkspaceWrite) {
  return requestWorkspace('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
}

/** The account's workspace on the server, through `/api/workspace`. */
export const cloudStore: WorkspaceStore = { read: readWorkspace, write: writeWorkspace, staleReads: true }
