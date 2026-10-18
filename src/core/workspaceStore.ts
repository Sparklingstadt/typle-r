import { AppError, type ErrorKey } from './appError'
import type { WorkspaceChange, WorkspaceDocument } from './workspaceDocument'

export type WorkspaceState = WorkspaceDocument & { revision: number; accountId: string }
export type WorkspaceWrite = WorkspaceChange & { revision: number; accountId: string }

/** An error with the HTTP status it means, such as 409 when `revision` is stale. */
export class WorkspaceError extends AppError {
  constructor(key: ErrorKey, readonly status: number) {
    super(key)
  }
}

/** Where the workspace is kept. */
export interface WorkspaceStore {
  read(): Promise<WorkspaceState>
  /** Rejects with a 409 `WorkspaceError` when `request.revision` is not the stored one. */
  write(request: WorkspaceWrite): Promise<WorkspaceState>
  /** Calls `onChange` when another tab changes the stored data; returns the function that stops it. */
  subscribe?(onChange: () => void): () => void
}
