import type { WorkspaceStore } from '../../core/workspaceStore'
import { guestStore } from './guest'

/** The store that keeps the workspace: this browser's LocalStorage. */
export function workspaceStore(): WorkspaceStore {
  return guestStore
}
