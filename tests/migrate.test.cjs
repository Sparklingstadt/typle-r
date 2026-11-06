const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Client } = require('pg')
const { checksum, localMigrations, migrate, newerThanLocal, pendingMigrations } = require('../scripts/migrate.cjs')

test('migrations of this checkout are listed by name', () => {
  const local = localMigrations()
  assert.ok(local.includes('0027_schema'))
  assert.deepEqual(local, [...local].sort())
  // Names sort in the order they were made only while the numbers keep the same width.
  assert.ok(local.every(name => /^\d{4}_/.test(name)), local.join(', '))
})

test('a database at the same migrations or behind them is not refused', () => {
  const local = ['0027_schema', '0028_admins', '0029_admins_ffpf']
  assert.deepEqual(newerThanLocal([], local), [])
  assert.deepEqual(newerThanLocal(['0027_schema'], local), [])
  assert.deepEqual(newerThanLocal(['0027_schema', '0028_admins', '0029_admins_ffpf'], local), [])
})

test('records of the migrations 0027_schema replaced are not refused', () => {
  // Production applied 0001 to 0026 before they were squashed into 0027_schema and keeps their records.
  const applied = ['0001_workspaces', '0002_practice_devices', '0026_interests', '0027_schema', '0028_admins']
  assert.deepEqual(newerThanLocal(applied, ['0027_schema', '0028_admins']), [])
})

test('an older checkout than the database is refused with the migrations it lacks', () => {
  // v0.99.4 still had 0001 to 0026 only; production has 0027_schema and later.
  const old = ['0001_workspaces', '0002_practice_devices', '0026_interests']
  const applied = ['0001_workspaces', '0027_schema', '0032_drop_legacy', '0028_admins']
  assert.deepEqual(newerThanLocal(applied, old), ['0027_schema', '0028_admins', '0032_drop_legacy'])
  assert.deepEqual(newerThanLocal(['0999_next'], localMigrations()), ['0999_next'])
})

test('migrations not applied yet are listed in the order they were made', () => {
  const local = ['0027_schema', '0028_admins', '0029_admins_ffpf']
  assert.deepEqual(pendingMigrations([], local), local)
  assert.deepEqual(pendingMigrations(['0001_workspaces', '0027_schema'], local), ['0028_admins', '0029_admins_ffpf'])
  assert.deepEqual(pendingMigrations(local, local), [])
})

test('the checksum is the one Prisma Migrate recorded: the SHA-256 of the file', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/0027_schema/migration.sql'), 'utf8')
  assert.match(checksum(sql), /^677f9a593b2b5c36[0-9a-f]{48}$/)
})

// The rest runs against a real database, as verify-go does: `TYPLE_TEST_DATABASE_URL=… node --test tests/migrate.test.cjs`.
const url = process.env.TYPLE_TEST_DATABASE_URL
const database = { skip: url ? false : 'TYPLE_TEST_DATABASE_URL is not set' }

/** Runs body with a client whose tables are in a schema of its own, dropped afterwards. */
async function inEmptySchema(body) {
  const client = new Client({ connectionString: url })
  await client.connect()
  const schema = `migrate_test_${process.pid}`
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await client.query(`CREATE SCHEMA ${schema}`)
    await client.query(`SET search_path TO ${schema}`)
    await body(client)
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await client.end()
  }
}

/** A directory of migrations from { name: sql }. */
function migrationsOf(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typle-migrations-'))
  for (const [name, sql] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, name))
    fs.writeFileSync(path.join(dir, name, 'migration.sql'), sql)
  }
  return dir
}

const names = async client =>
  (await client.query('SELECT migration_name FROM _prisma_migrations ORDER BY 1')).rows.map(row => row.migration_name)
const hasTable = async (client, name) => (await client.query('SELECT to_regclass($1) IS NOT NULL AS found', [name])).rows[0].found

test('a new database gets every migration, and a second run changes nothing', database, () => inEmptySchema(async client => {
  const local = localMigrations()
  assert.deepEqual(await migrate(client), local)
  assert.deepEqual(await names(client), local)
  assert.ok(await hasTable(client, 'typle_workspaces'))
  assert.deepEqual(await migrate(client), [])
  assert.deepEqual(await names(client), local)
}))

test('a failed migration is undone whole and is not recorded', database, () => inEmptySchema(async client => {
  const dir = migrationsOf({
    '0001_good': 'CREATE TABLE good (id int);',
    '0002_bad': 'CREATE TABLE half_done (id int); SELECT 1 / 0;',
    '0003_later': 'CREATE TABLE later (id int);',
  })
  await assert.rejects(migrate(client, dir), /0002_bad failed and was rolled back/)
  assert.deepEqual(await names(client), ['0001_good'])
  assert.ok(await hasTable(client, 'good'))
  assert.ok(!await hasTable(client, 'half_done'))
  assert.ok(!await hasTable(client, 'later'))
}))

test('a failure Prisma Migrate recorded stops the run until it is repaired', database, () => inEmptySchema(async client => {
  const dir = migrationsOf({ '0001_good': 'CREATE TABLE good (id int);', '0002_next': 'CREATE TABLE next_one (id int);' })
  await migrate(client, migrationsOf({ '0001_good': 'CREATE TABLE good (id int);' }))
  await client.query("INSERT INTO _prisma_migrations (id, checksum, migration_name) VALUES ('failed', 'x', '0000_failed')")
  await assert.rejects(migrate(client, dir), /records failed migrations: 0000_failed/)
  assert.ok(!await hasTable(client, 'next_one'))
  // The repair of docs/release-workflow.md.
  await client.query("UPDATE _prisma_migrations SET rolled_back_at = now() WHERE migration_name = '0000_failed' AND finished_at IS NULL")
  assert.deepEqual(await migrate(client, dir), ['0002_next'])
}))

test('a checkout older than the database applies nothing', database, () => inEmptySchema(async client => {
  await migrate(client, migrationsOf({ '0001_old': 'CREATE TABLE old (id int);', '0002_new': 'CREATE TABLE new_one (id int);' }))
  const older = migrationsOf({ '0001_old': 'CREATE TABLE old (id int);', '0000_older': 'CREATE TABLE older (id int);' })
  await assert.rejects(migrate(client, older), /does not have: 0002_new/)
  assert.ok(!await hasTable(client, 'older'))
}))

test('a database with tables but no history is refused', database, () => inEmptySchema(async client => {
  await client.query('CREATE TABLE someone_elses (id int)')
  await assert.rejects(migrate(client, migrationsOf({ '0001_good': 'CREATE TABLE good (id int);' })), /no migration history/)
  assert.ok(!await hasTable(client, 'good'))
  assert.ok(!await hasTable(client, '_prisma_migrations'))
}))
