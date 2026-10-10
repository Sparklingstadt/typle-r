import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { applyChange, decodeDocument, DEFAULT_PROFILE_ID, viewDocument, type WorkspaceChange, type WorkspaceDocument, type WorkspaceView } from '../../../core/profiles'
import { sharedKeys, type SharedList } from '../../../core/sharedLists'

export type Workspace = WorkspaceView & { revision: number }

type Client = PrismaClient | Prisma.TransactionClient
type ShareRow = { shareId: string; profileId: string; listId: string }

const empty: WorkspaceDocument = decodeDocument({ lists: [], devices: [], profiles: [] })

function json(value: unknown) {
  return value as Prisma.InputJsonValue
}

const key = (profileId: string, listId: string) => `${profileId}\n${listId}`

function allLists(document: WorkspaceDocument) {
  return document.profiles.map(profile => ({ profileId: profile.id, lists: profile.id === DEFAULT_PROFILE_ID ? document.lists : profile.lists ?? [] }))
}

// One profile's lists as the client sees them, with the link of each shared one.
function view(document: WorkspaceDocument, profileId: string, revision: number, rows: ShareRow[]): Workspace {
  const shown = viewDocument(document, profileId)
  const links = new Map(rows.map(row => [key(row.profileId, row.listId), row.shareId]))
  const lists = shown.lists.map(list => {
    const shareId = list.shared ? links.get(key(shown.profileId, list.id)) : undefined
    return shareId ? { ...list, shareId } : list
  })
  return { ...shown, lists, revision }
}

const shareRows = (client: Client, ownerId: string) =>
  client.sharedList.findMany({ where: { ownerId }, select: { shareId: true, profileId: true, listId: true } })

// Makes the owner's shared rows match the saved workspace: new shares get a link, edits update it, the rest are removed.
async function syncShared(client: Client, ownerId: string, document: WorkspaceDocument): Promise<ShareRow[]> {
  const wanted = new Map(allLists(document).flatMap(({ profileId, lists }) =>
    sharedKeys(lists).map(listId => [key(profileId, listId), { profileId, list: lists.find(list => list.id === listId)! }] as const)))
  const existing = await shareRows(client, ownerId)
  const stale = existing.filter(row => !wanted.has(key(row.profileId, row.listId)))
  if (stale.length) await client.sharedList.deleteMany({ where: { shareId: { in: stale.map(row => row.shareId) } } })
  const kept = new Map(existing.map(row => [key(row.profileId, row.listId), row]))
  const rows: ShareRow[] = []
  for (const [id, { profileId, list }] of wanted) {
    const content = { name: list.name, words: json(list.words), updatedAt: new Date() }
    const row = kept.get(id)
    if (row) {
      await client.sharedList.update({ where: { shareId: row.shareId }, data: content })
      rows.push(row)
    } else {
      const created = { shareId: randomUUID(), profileId, listId: list.id }
      await client.sharedList.create({ data: { ...created, ownerId, ...content } })
      rows.push(created)
    }
  }
  return rows
}

export function workspaceRepository(client: PrismaClient) {
  return {
    async read(ownerId: string, profileId = DEFAULT_PROFILE_ID): Promise<Workspace> {
      const [row, rows] = await Promise.all([client.workspace.findUnique({ where: { ownerId } }), shareRows(client, ownerId)])
      return row ? view(decodeDocument(row), profileId, row.revision, rows) : view(empty, profileId, 0, rows)
    },
    /** Resolves null when `revision` is stale; throws when the change names a profile that no longer exists.
     * Shared lists are updated in the same transaction, so a rejected save leaves their links as they were. */
    async write(ownerId: string, revision: number, change: WorkspaceChange): Promise<Workspace | null> {
      try {
        return await client.$transaction(async tx => {
          let row
          if (revision === 0) {
            const next = applyChange(empty, change)
            row = await tx.workspace.create({ data: { ownerId, lists: json(next.lists), devices: json(next.devices), profiles: json(next.profiles) } })
          } else {
            const current = await tx.workspace.findUnique({ where: { ownerId } })
            if (!current || current.revision !== revision) return null
            const next = applyChange(decodeDocument(current), change)
            // Unique owner + revision makes the comparison and update one atomic operation.
            row = await tx.workspace.update({
              where: { ownerId, revision },
              data: { lists: json(next.lists), devices: json(next.devices), profiles: json(next.profiles), revision: { increment: 1 }, updatedAt: new Date() },
            })
          }
          const document = decodeDocument(row)
          return view(document, change.profileId, row.revision, await syncShared(tx, ownerId, document))
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
  }
}
