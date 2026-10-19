import { Prisma, type PrismaClient } from '@prisma/client'
import { applyChange, decodeDocument, type WorkspaceChange, type WorkspaceDocument } from '../../../core/workspaceDocument'

export type Workspace = WorkspaceDocument & { revision: number }

const empty: WorkspaceDocument = { lists: [], devices: [] }

function json(value: unknown) {
  return value as Prisma.InputJsonValue
}

function view(document: WorkspaceDocument, revision: number): Workspace {
  return { lists: document.lists, devices: document.devices, revision }
}

export function workspaceRepository(client: PrismaClient) {
  return {
    async read(ownerId: string): Promise<Workspace> {
      const row = await client.workspace.findUnique({ where: { ownerId } })
      return row ? view(decodeDocument(row), row.revision) : view(empty, 0)
    },
    /** Resolves null when `revision` is stale. */
    async write(ownerId: string, revision: number, change: WorkspaceChange): Promise<Workspace | null> {
      try {
        let row
        if (revision === 0) {
          const next = applyChange(empty, change)
          row = await client.workspace.create({ data: { ownerId, lists: json(next.lists), devices: json(next.devices) } })
        } else {
          const current = await client.workspace.findUnique({ where: { ownerId } })
          if (!current || current.revision !== revision) return null
          const next = applyChange(decodeDocument(current), change)
          // Unique owner + revision makes the comparison and update one atomic operation.
          row = await client.workspace.update({
            where: { ownerId, revision },
            data: { lists: json(next.lists), devices: json(next.devices), revision: { increment: 1 }, updatedAt: new Date() },
          })
        }
        return view(decodeDocument(row), row.revision)
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
            ((revision === 0 && error.code === 'P2002') || (revision > 0 && error.code === 'P2025'))) return null
        throw error
      }
    },
  }
}
