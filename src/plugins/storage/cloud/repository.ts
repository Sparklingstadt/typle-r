import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { AppError } from '../../../core/appError'
import { sharedKeys, stripShareIds, type SharedList } from '../../../core/sharedLists'
import type { SavedWordList } from '../../../core/wordLists'
import { applyChange, decodeDocument, type WorkspaceChange, type WorkspaceDocument } from '../../../core/workspaceDocument'
import { MAX_WORKSPACE_BYTES } from '../../../core/workspaceRequest'

export type Workspace = WorkspaceDocument & { revision: number }

type Client = PrismaClient | Prisma.TransactionClient
type ShareRow = { shareId: string; listId: string }

const empty: WorkspaceDocument = { lists: [], devices: [] }

function json(value: unknown) {
  return value as Prisma.InputJsonValue
}

// The lists as the client sees them, with the link of each shared one.
function view(document: WorkspaceDocument, revision: number, rows: ShareRow[]): Workspace {
  const links = new Map(rows.map(row => [row.listId, row.shareId]))
  const lists = document.lists.map(list => {
    const shareId = list.shared ? links.get(list.id) : undefined
    return shareId ? { ...list, shareId } : list
  })
  return { lists, devices: document.devices, revision }
}

const shareRows = (client: Client, ownerId: string) =>
  client.sharedList.findMany({ where: { ownerId }, select: { shareId: true, listId: true } })

// Only what a share link shows; a future word field is not published unless added here.
const sharedContent = (list: SavedWordList) =>
  JSON.stringify([list.name, list.words.map(({ display, input, annotation }) => ({ display, input, annotation }))])

// Makes the owner's shared rows match the saved workspace: new shares get a link, changed names or words update it,
// the rest are removed. Rows of unchanged lists are left alone, so `updatedAt` means "content changed" and the public
// link does not reveal when the owner practises or edits other lists.
async function syncShared(client: Client, ownerId: string, previous: WorkspaceDocument, document: WorkspaceDocument): Promise<ShareRow[]> {
  const before = new Map(previous.lists.map(list => [list.id, sharedContent(list)]))
  const wanted = new Map(sharedKeys(document.lists).map(listId => [listId, document.lists.find(list => list.id === listId)!]))
  const existing = await shareRows(client, ownerId)
  const stale = existing.filter(row => !wanted.has(row.listId))
  if (stale.length) await client.sharedList.deleteMany({ where: { shareId: { in: stale.map(row => row.shareId) } } })
  const kept = new Map(existing.map(row => [row.listId, row]))
  const rows: ShareRow[] = []
  for (const [listId, list] of wanted) {
    const content = { name: list.name, words: json(list.words.map(({ display, input, annotation }) => ({ display, input, annotation }))), updatedAt: new Date() }
    const row = kept.get(listId)
    if (row) {
      if (before.get(listId) !== sharedContent(list)) await client.sharedList.update({ where: { shareId: row.shareId }, data: content })
      rows.push(row)
    } else {
      const created = { shareId: randomUUID(), listId }
      await client.sharedList.create({ data: { ...created, ownerId, ...content } })
      rows.push(created)
    }
  }
  return rows
}

const MODIFY_ATTEMPTS = 3

/** The most the lists (JSON, as guest storage measures them) may grow to through `modify`. A web save sends the
 * same lists inside a PUT body limited to MAX_WORKSPACE_BYTES, with share ids, devices and ids around them:
 * at most about 111 KB (mostly 100 devices), so 128 KiB is kept free for that. */
export const MAX_API_LISTS_BYTES = MAX_WORKSPACE_BYTES - 128 * 1024

const listBytes = (lists: SavedWordList[]) => Buffer.byteLength(JSON.stringify(stripShareIds(lists)))

export function workspaceRepository(client: PrismaClient) {
  const repository = {
    async read(ownerId: string): Promise<Workspace> {
      const [row, rows] = await Promise.all([client.workspace.findUnique({ where: { ownerId } }), shareRows(client, ownerId)])
      return row ? view(decodeDocument(row), row.revision, rows) : view(empty, 0, rows)
    },
    /** Resolves null when `revision` is stale. Shared lists are updated in the same transaction, so a rejected save
     * leaves their links as they were. */
    async write(ownerId: string, revision: number, change: WorkspaceChange): Promise<Workspace | null> {
      try {
        return await client.$transaction(async tx => {
          let row
          let previous = empty
          if (revision === 0) {
            const next = applyChange(empty, change)
            row = await tx.workspace.create({ data: { ownerId, lists: json(next.lists), devices: json(next.devices) } })
          } else {
            const current = await tx.workspace.findUnique({ where: { ownerId } })
            if (!current || current.revision !== revision) return null
            previous = decodeDocument(current)
            const next = applyChange(previous, change)
            // Unique owner + revision makes the comparison and update one atomic operation.
            row = await tx.workspace.update({
              where: { ownerId, revision },
              data: { lists: json(next.lists), devices: json(next.devices), revision: { increment: 1 }, updatedAt: new Date() },
            })
          }
          const document = decodeDocument(row)
          return view(document, row.revision, await syncShared(tx, ownerId, previous, document))
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
            ((revision === 0 && error.code === 'P2002') || (revision > 0 && error.code === 'P2025'))) return null
        throw error
      }
    },
    /** The name and words behind a share link, or null when the list is no longer shared. */
    async readShared(shareId: string): Promise<SharedList | null> {
      const row = await client.sharedList.findUnique({ where: { shareId }, select: { name: true, words: true, updatedAt: true } })
      return row && { name: row.name, words: row.words as SharedList['words'], updatedAt: row.updatedAt.toISOString() }
    },
    /** Changes the lists from what is saved now, retrying when another save lands first.
     * `change` may run more than once. Returning the lists it was given leaves the workspace as it is, without a new revision. */
    async modify<T>(ownerId: string, change: (workspace: Workspace) => { lists: SavedWordList[]; result: T }): Promise<{ workspace: Workspace; result: T }> {
      for (let attempt = 0; attempt < MODIFY_ATTEMPTS; attempt++) {
        const workspace = await repository.read(ownerId)
        const next = change(workspace)
        if (next.lists === workspace.lists) return { workspace, result: next.result }
        // Lists the web app saved above the limit may still shrink, e.g. by deleting a list.
        const bytes = listBytes(next.lists)
        if (bytes > MAX_API_LISTS_BYTES && bytes >= listBytes(workspace.lists)) throw new AppError('workspaceTooLarge')
        const saved = await repository.write(ownerId, workspace.revision, { lists: stripShareIds(next.lists) })
        if (saved) return { workspace: saved, result: next.result }
      }
      throw new AppError('conflict')
    },
  }
  return repository
}
