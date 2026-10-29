import { AppError, type ErrorKey } from '../../../core/appError'
import { withoutFollowedWords } from '../../../core/followedPacks'
import { GraphQLError, graphql } from '../../../core/graphql'
import { decodeDocument } from '../../../core/workspaceDocument'
import { followed } from '../official'
import { WorkspaceError, type RecordAdd, type RecordDelete, type WorkspaceState, type WorkspaceStore, type WorkspaceWrite } from '../../../core/workspaceStore'

/** The fields of a `Workspace`: the workspace as saved. */
const WORKSPACE = 'lists packs devices interests revision accountId'

type Saved = { lists: unknown; packs: unknown; devices: unknown; interests: unknown; revision: unknown; accountId: unknown }

type Data = Record<string, (Saved & { workspace?: Saved }) | undefined>

/** Runs a query or mutation and reads the workspace that `pick` finds in its data. */
async function requestWorkspace(pick: (data: Data) => Saved | undefined, query: string, variables?: Record<string, unknown>): Promise<WorkspaceState> {
  let data: Data
  try {
    data = await graphql(query, variables)
  } catch (reason) {
    // The backend's error keys are those of the `errors` messages; one it did not name is shown as a failed request.
    if (reason instanceof GraphQLError) throw new WorkspaceError((reason.key ?? 'workspaceRequestFailed') as ErrorKey, reason.status)
    throw reason
  }
  const saved = pick(data)
  if (!saved || !Number.isSafeInteger(saved.revision) || (saved.revision as number) < 0 || typeof saved.accountId !== 'string') {
    throw new AppError('invalidServerData')
  }
  // `packs` is null for an account that has saved nothing.
  const { lists, packs, devices, interests } = decodeDocument({ lists: saved.lists, packs: saved.packs, devices: saved.devices, interests: saved.interests })
  // Followed packs are saved without their words: the catalog gives them back.
  return followed({ accountId: saved.accountId, revision: saved.revision as number, lists, packs, devices, interests })
}

export function readWorkspace() {
  return requestWorkspace(data => data.workspace, `query Workspace { workspace { ${WORKSPACE} } }`)
}

export function writeWorkspace(request: WorkspaceWrite) {
  // Followed packs' lists are sent without their words, as they are saved.
  const sent = request.lists && request.packs ? { ...request, ...withoutFollowedWords({ lists: request.lists, packs: request.packs }) } : request
  return requestWorkspace(data => data.saveWorkspace,
    `mutation SaveWorkspace($input: SaveWorkspaceInput!) { saveWorkspace(input: $input) { ${WORKSPACE} } }`, { input: sent })
}

export function addRecord(request: RecordAdd) {
  return requestWorkspace(data => data.addRecord?.workspace,
    `mutation AddRecord($input: AddRecordInput!) { addRecord(input: $input) { workspace { ${WORKSPACE} } } }`, { input: request })
}

export function deleteRecord(request: RecordDelete) {
  return requestWorkspace(data => data.deleteRecord,
    `mutation DeleteRecord($input: DeleteRecordInput!) { deleteRecord(input: $input) { ${WORKSPACE} } }`, { input: request })
}

/** The account's workspace on the server, through `/api/graphql`. */
export const cloudStore: WorkspaceStore = { location: 'account', read: readWorkspace, write: writeWorkspace, addRecord, deleteRecord, staleReads: true }
