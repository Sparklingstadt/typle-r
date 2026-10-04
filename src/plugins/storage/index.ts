import type { WorkspaceStore } from '../../core/workspaceStore'
import { cloudStore } from './cloud/client'
import { GUEST_ACCOUNT_ID, guestStore } from './guest'

/** The store that keeps `accountId`'s workspace: this browser for the guest, the cloud for a login. */
export function workspaceStore(accountId: string): WorkspaceStore {
  return accountId === GUEST_ACCOUNT_ID ? guestStore : cloudStore
}
