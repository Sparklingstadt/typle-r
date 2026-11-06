// The adminDashboard of /api/graphql (server/internal/web/graph/schema.graphqls, server/internal/store/admin.go).
export type Overview = {
  workspaces: number
  activeDay: number
  activeWeek: number
  activeMonth: number
  sharedPacks: number
  recentShares: { id: string; ownerId: string; name: string; updatedAt: string }[]
  admins: { email: string; ffpfSub: string | null; createdAt: string; lastSeenAt: string | null }[]
}

export const stats = ['workspaces', 'activeDay', 'activeWeek', 'activeMonth', 'sharedPacks'] as const
