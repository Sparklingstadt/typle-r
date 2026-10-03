import { AppError, type ErrorKey } from './appError'
import { decodeDevices, type PracticeDevice } from './devices'
import { decodeLists, type SavedWordList } from './wordLists'

export type WorkspaceState = { lists: SavedWordList[]; devices: PracticeDevice[]; revision: number; accountId: string }
export type WorkspaceUpdate = (change: (lists: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => Promise<boolean>

export class WorkspaceError extends AppError {
  constructor(key: ErrorKey, readonly status: number) {
    super(key)
  }
}

async function requestWorkspace(init?: RequestInit): Promise<WorkspaceState> {
  const response = await fetch('/api/workspace', { cache: 'no-store', ...init })
  const data = await response.json()
  if (!response.ok) throw new WorkspaceError(typeof data.error === 'string' ? data.error as ErrorKey : 'workspaceRequestFailed', response.status)
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.accountId !== 'string') {
    throw new AppError('invalidServerData')
  }
  return { accountId: data.accountId, revision: data.revision, devices: decodeDevices(data.devices ?? []),
    lists: decodeLists(JSON.stringify({ version: 1, lists: data.lists })) }
}

export function readWorkspace() {
  return requestWorkspace()
}

export function writeWorkspace(state: WorkspaceState) {
  return requestWorkspace({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
}
