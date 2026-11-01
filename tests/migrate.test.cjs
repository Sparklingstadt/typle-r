const assert = require('node:assert/strict')
const test = require('node:test')
const { localMigrations, newerThanLocal } = require('../scripts/migrate.cjs')

test('migrations of this checkout are listed by name, without the lock file', () => {
  const local = localMigrations()
  assert.ok(local.includes('0027_schema'))
  assert.ok(!local.includes('migration_lock.toml'))
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
  assert.deepEqual(newerThanLocal(['0033_next'], localMigrations()), ['0033_next'])
})
