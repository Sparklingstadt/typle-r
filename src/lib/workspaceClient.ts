import { decodeDevices, type PracticeDevice } from './devices'
import { decodeLists, type SavedWordList } from './wordLists'

export type WorkspaceState = { lists: SavedWordList[]; devices: PracticeDevice[]; revision: number; accountId: string }
export type WorkspaceUpdate = (change: (lists: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => Promise<boolean>

export class WorkspaceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function requestWorkspace(init?: RequestInit): Promise<WorkspaceState> {
  const response = await fetch('/api/workspace', { cache: 'no-store', ...init })
  const data = await response.json()
  if (!response.ok) throw new WorkspaceError(data.error ?? 'データを取得・保存できませんでした。', response.status)
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.accountId !== 'string') {
    throw new Error('サーバーからのデータが不正です。')
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
