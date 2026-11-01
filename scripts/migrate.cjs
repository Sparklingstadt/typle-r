const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const cli = path.join(__dirname, '../node_modules/prisma/build/index.js')
const migrations = path.join(__dirname, '../prisma/migrations')

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status || 1)
}

/** The migrations this checkout has, by name. */
function localMigrations(dir = migrations) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
}

/**
 * The applied migrations that are newer than every migration of this checkout. Names start with a zero-padded number,
 * so they sort in the order they were made. Applied migrations that are older and no longer here (0001 to 0026, which
 * 0027_schema replaced) are fine: production keeps their records.
 */
function newerThanLocal(applied, local) {
  const latest = [...local].sort().at(-1)
  return applied.filter(name => latest === undefined || name > latest).sort()
}

/** The migrations the database records as applied, or none when it has no migration table yet. */
async function appliedMigrations(connectionString) {
  const { Client } = require('pg')
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const { rows } = await client.query(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')
    return rows.map(row => row.migration_name)
  } catch (error) {
    if (error.code === '42P01') return [] // undefined_table: a new database
    throw error
  } finally {
    await client.end()
  }
}

/**
 * Stops when the database already has a migration this checkout does not know: the code is older than the database,
 * as when an old commit is deployed to production. Prisma would apply the old migrations it thinks are missing instead.
 */
async function refuseOlderCheckout() {
  require('@next/env').loadEnvConfig(path.join(__dirname, '..'))
  // The same variables, in the same order, as prisma.config.ts.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) return // prisma migrate deploy reports the missing database itself
  const newer = newerThanLocal(await appliedMigrations(url), localMigrations())
  if (newer.length === 0) return
  console.error(`The database has migrations this checkout does not have: ${newer.join(', ')}.`)
  console.error('This code is older than the database. Deploy the latest main instead; no migration was applied.')
  process.exit(1)
}

async function main() {
  await refuseOlderCheckout()
  if (process.argv.includes('--baseline')) {
    // Compare the legacy database with the table of v0.3.x, then bring it up to date with 0027_schema, which changes
    // only what is missing, and record that migration as applied.
    run(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/baseline.prisma', '--exit-code'])
    run(['db', 'execute', '--file', 'prisma/migrations/0027_schema/migration.sql'])
    run(['migrate', 'resolve', '--applied', '0027_schema'])
  }
  run(['migrate', 'deploy'])
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Check the database before migrating: ${error.message}`)
    process.exit(1)
  })
}

module.exports = { localMigrations, newerThanLocal }
