import { AppError, type ErrorKey } from './appError'
import type { RecordInput } from './records'
import type { WorkspaceChange, WorkspaceDocument } from './workspaceDocument'

export type WorkspaceState = WorkspaceDocument & { revision: number; accountId: string }
export type WorkspaceWrite = WorkspaceChange & { revision: number; accountId: string }
/** A practice run to add to a list: an operation of its own, which names no revision. */
export type RecordAdd = { accountId: string; listId: string; record: RecordInput }
/** A practice run to delete from a list, by its id: an operation of its own, as `RecordAdd`. */
export type RecordDelete = { accountId: string; listId: string; recordId: string }
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
  read(): Promise<WorkspaceState>
  /** Rejects with a 409 `WorkspaceError` when `request.revision` is not the stored one. */
  write(request: WorkspaceWrite): Promise<WorkspaceState>
  /** Adds the run with the rules of `addRecord` (src/core/records.ts) and resolves with the state it was saved in. It
   * names no revision, so a change saved meanwhile neither refuses it nor is undone by it; sending a run again is safe. */
  addRecord(request: RecordAdd): Promise<WorkspaceState>
  /** Deletes the run with the rules of `deleteRecord` (src/core/records.ts), without a revision, as `addRecord`. A run
   * already gone is not an error. */
  deleteRecord(request: RecordDelete): Promise<WorkspaceState>
  /** A read can finish after a later save (a network request), so a lower revision than the one shown is stale.
   * Otherwise a lower revision is the store's real state, e.g. after the browser's data was cleared. */
  readonly staleReads: boolean
  /** Calls `onChange` when another tab changes the stored data; returns the function that stops it. */
  subscribe?(onChange: () => void): () => void
}
