import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { strictSslUrl } from './databaseUrl'
import { workspaceRepository } from './repository'

const globalDb = globalThis as typeof globalThis & { typlePrisma?: PrismaClient }

export function database() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) throw new Error('Database is not configured')
  if (!globalDb.typlePrisma) {
    const adapter = new PrismaPg({ connectionString: strictSslUrl(url), max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }, {
      onPoolError: () => console.error('An idle PostgreSQL connection was interrupted.'),
    })
    globalDb.typlePrisma = new PrismaClient({ adapter })
  }
  return workspaceRepository(globalDb.typlePrisma)
}
