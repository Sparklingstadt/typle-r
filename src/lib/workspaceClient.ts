import { AppError, type ErrorKey } from './appError'
import { decodeDevices } from './devices'
import { decodeProfileSummaries, DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, type WorkspaceChange, type WorkspaceView } from './profiles'
import { decodeLists, type SavedWordList } from './wordLists'

export type WorkspaceState = WorkspaceView & { revision: number; accountId: string }
export type WorkspaceWrite = WorkspaceChange & { revision: number; accountId: string }
export type WorkspaceUpdate = (change: (lists: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => Promise<boolean>

export class WorkspaceError extends AppError {
  constructor(key: ErrorKey, readonly status: number) {
    super(key)
  }
}

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
