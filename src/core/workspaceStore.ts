import { AppError, type ErrorKey } from './appError'
import type { WorkspaceChange, WorkspaceView } from './profiles'

export type WorkspaceState = WorkspaceView & { revision: number; accountId: string }
export type WorkspaceWrite = WorkspaceChange & { revision: number; accountId: string }
/** Where the data is kept, as screens tell the reader: this browser only, or the login's account. */
export type WorkspaceLocation = 'browser' | 'account'

/** An error with the HTTP status it means, such as 409 when `revision` is stale. */
export class WorkspaceError extends AppError {
  constructor(key: ErrorKey, readonly status: number) {
    super(key)
  }
}

/** Where one account's workspace is kept: the cloud for a GitHub login, this browser for a guest. */
export interface WorkspaceStore {
  readonly location: WorkspaceLocation
  read(profileId: string): Promise<WorkspaceState>
  /** Rejects with a 409 `WorkspaceError` when `request.revision` is not the stored one. */
  write(request: WorkspaceWrite): Promise<WorkspaceState>
  /** A read can finish after a later save (a network request), so a lower revision than the one shown is stale.
   * Otherwise a lower revision is the store's real state, e.g. after the browser's data was cleared. */
  readonly staleReads: boolean
  /** Calls `onChange` when another tab changes the stored data; returns the function that stops it. */
  subscribe?(onChange: () => void): () => void
}
