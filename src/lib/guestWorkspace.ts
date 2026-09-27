import { WorkspaceError, type WorkspaceState } from './workspaceClient'
import { MAX_WORKSPACE_BYTES, validateWorkspaceRequest } from './workspaceRequest'

export const GUEST_ACCOUNT_ID = 'guest:local'
export const GUEST_STORAGE_KEY = 'typle-r:guest-workspace:v1'

export function readGuestWorkspace(storage: Storage = localStorage): WorkspaceState {
  const raw = storage.getItem(GUEST_STORAGE_KEY)
  if (raw === null) return { accountId: GUEST_ACCOUNT_ID, revision: 0, lists: [], devices: [] }
  try {
    if (new TextEncoder().encode(raw).length > MAX_WORKSPACE_BYTES) throw new Error('Too large')
    const value = JSON.parse(raw)
    if (value.version !== 1 || value.accountId !== GUEST_ACCOUNT_ID) throw new Error('Invalid guest workspace')
    const data = validateWorkspaceRequest(value)
    return { ...data, devices: data.devices ?? [], accountId: GUEST_ACCOUNT_ID }
  } catch {
    throw new Error('ブラウザーの保存データを読み込めません。元のデータは変更していません。')
  }
}

export function writeGuestWorkspace(state: WorkspaceState, storage: Storage = localStorage): WorkspaceState {
  if (state.accountId !== GUEST_ACCOUNT_ID) throw new Error('保存先が変わりました。画面を開き直してください。')
  const previous = readGuestWorkspace(storage)
  if (previous.revision !== state.revision) throw new WorkspaceError('別の画面で更新されています。最新データを読み込んでから再試行してください。', 409)
  const next = { ...validateWorkspaceRequest(state), devices: state.devices, accountId: GUEST_ACCOUNT_ID, revision: state.revision + 1 }
  const raw = JSON.stringify({ version: 1, ...next })
  if (!Number.isSafeInteger(next.revision) || new TextEncoder().encode(raw).length > MAX_WORKSPACE_BYTES) {
    throw new Error('保存できるデータ量を超えています。単語リストや記録を整理してください。')
  }
  try { storage.setItem(GUEST_STORAGE_KEY, raw) }
  catch { throw new Error('ブラウザーに保存できません。空き容量や保存設定を確認して再試行してください。') }
  return next
}

// Serialize read/check/write across tabs where the Web Locks API is available.
export async function saveGuestWorkspace(state: WorkspaceState) {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(GUEST_STORAGE_KEY, () => writeGuestWorkspace(state))
  }
  return writeGuestWorkspace(state)
}
