import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'prisma/config'

loadEnvConfig(process.cwd())
const url = process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node scripts/seed.cjs' },
  ...(url ? { datasource: { url } } : {}),
})
