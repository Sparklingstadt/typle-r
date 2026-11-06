const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
const migrations = path.join(root, 'db/migrations')

// The history stays in the table Prisma Migrate made, with the same columns and checksums: production's records
// (0001 to 0026 among them) need no change, and the table is what docs/release-workflow.md tells how to repair.
const historyTable = `CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id varchar(36) PRIMARY KEY,
  checksum varchar(64) NOT NULL,
  finished_at timestamptz,
  migration_name varchar(255) NOT NULL,
  logs text,
  rolled_back_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  applied_steps_count integer NOT NULL DEFAULT 0
)`

// The key Prisma Migrate locked, so that a run of either kind waits for the other.
const lockKey = 72707369
const lockWaitMs = 30_000

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

/** The migrations of this checkout that are not applied yet, in the order they were made. */
function pendingMigrations(applied, local) {
  const done = new Set(applied)
  return local.filter(name => !done.has(name)).sort()
}

/** The checksum of a migration's file, as Prisma Migrate recorded it. */
function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

const isApplied = row => row.finished_at !== null && row.rolled_back_at === null
const isFailed = row => row.finished_at === null && row.rolled_back_at === null

/** Waits for the other runs to end. The lock goes with the connection. */
async function lock(client) {
  const deadline = Date.now() + lockWaitMs
  for (;;) {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [lockKey])
    if (rows[0].locked) return
    if (Date.now() > deadline) throw new Error('Another migration is still running; no migration was applied.')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

/** The rows of the history, made first in a new database. Any other database without a history is refused. */
async function readHistory(client) {
  const { rows: [{ exists }] } = await client.query("SELECT to_regclass('_prisma_migrations') IS NOT NULL AS exists")
  if (!exists) {
    const { rows: [{ tables }] } = await client.query(
      'SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = current_schema()')
    if (tables > 0) throw new Error('This database has tables but no migration history. Check that it is the right database; no migration was applied.')
    await client.query(historyTable)
  }
  const { rows } = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations')
  return rows
}

/** A migration and its record are one transaction: a failure leaves the database as it was and records nothing. */
async function apply(client, name, sql) {
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ($1, $2, now(), $3, 1)`, [crypto.randomUUID(), checksum(sql), name])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw new Error(`${name} failed and was rolled back: ${error.message}`)
  }
}

/** Applies the migrations of dir that the database of client does not have, and returns their names. */
async function migrate(client, dir = migrations) {
  await lock(client)
  const history = await readHistory(client)
  const local = localMigrations(dir)
  // The code is older than the database, as when an old commit is deployed to production: what looks missing is old.
  const newer = newerThanLocal(history.filter(isApplied).map(row => row.migration_name), local)
  if (newer.length > 0) {
    throw new Error(`The database has migrations this checkout does not have: ${newer.join(', ')}.\n` +
      'This code is older than the database. Deploy the latest main instead; no migration was applied.')
  }
  const failed = history.filter(isFailed).map(row => row.migration_name).sort()
  if (failed.length > 0) {
    throw new Error(`The database records failed migrations: ${failed.join(', ')}.\n` +
      'See "マイグレーションの失敗" in docs/release-workflow.md; no migration was applied.')
  }
  const read = name => fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8')
  for (const row of history.filter(isApplied)) {
    if (local.includes(row.migration_name) && checksum(read(row.migration_name)) !== row.checksum) {
      console.warn(`${row.migration_name} was changed after it was applied. A change belongs in a new migration.`)
    }
  }
  const pending = pendingMigrations(history.filter(isApplied).map(row => row.migration_name), local)
  for (const name of pending) {
    await apply(client, name, read(name))
    console.log(`Applied ${name}`)
  }
  return pending
}

async function main() {
  require('@next/env').loadEnvConfig(root)
  // A direct connection first: the lock needs one session, which a pooled connection may not keep.
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!connectionString) throw new Error('Set DIRECT_URL or DATABASE_URL to the database to migrate.')
  const { Client } = require('pg')
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const applied = await migrate(client)
    if (applied.length === 0) console.log('No migrations to apply.')
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = { checksum, localMigrations, migrate, newerThanLocal, pendingMigrations }
