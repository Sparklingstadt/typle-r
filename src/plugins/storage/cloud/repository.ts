import { Prisma, type PrismaClient } from '@prisma/client'
import { applyChange, decodeDocument, DEFAULT_PROFILE_ID, viewDocument, type WorkspaceChange, type WorkspaceDocument, type WorkspaceView } from '../../../core/profiles'

export type Workspace = WorkspaceView & { revision: number }

const empty: WorkspaceDocument = decodeDocument({ lists: [], devices: [], profiles: [] })

function json(value: unknown) {
  return value as Prisma.InputJsonValue
}

export function workspaceRepository(client: PrismaClient) {
  return {
    async read(ownerId: string, profileId = DEFAULT_PROFILE_ID): Promise<Workspace> {
      const row = await client.workspace.findUnique({ where: { ownerId } })
      return row ? { ...viewDocument(decodeDocument(row), profileId), revision: row.revision } : { ...viewDocument(empty, profileId), revision: 0 }
    },
    /** Resolves null when `revision` is stale; throws when the change names a profile that no longer exists. */
    async write(ownerId: string, revision: number, change: WorkspaceChange): Promise<Workspace | null> {
      try {
        if (revision === 0) {
          const next = applyChange(empty, change)
          const row = await client.workspace.create({ data: { ownerId, lists: json(next.lists), devices: json(next.devices), profiles: json(next.profiles) } })
          return { ...viewDocument(decodeDocument(row), change.profileId), revision: row.revision }
        }
        const current = await client.workspace.findUnique({ where: { ownerId } })
        if (!current || current.revision !== revision) return null
        const next = applyChange(decodeDocument(current), change)
        // Unique owner + revision makes the comparison and update one atomic operation.
        const row = await client.workspace.update({
          where: { ownerId, revision },
          data: { lists: json(next.lists), devices: json(next.devices), profiles: json(next.profiles), revision: { increment: 1 }, updatedAt: new Date() },
        })
        return { ...viewDocument(decodeDocument(row), change.profileId), revision: row.revision }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
            ((revision === 0 && error.code === 'P2002') || (revision > 0 && error.code === 'P2025'))) return null
        throw error
      }
    },
  }
}
