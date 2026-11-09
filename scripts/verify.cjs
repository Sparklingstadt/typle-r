// Runs, in order, every check a commit must pass before it is released (docs/release-workflow.md), and stops at the
// first failure: the migrations on the local database, the migration tests, the Go checks and DB tests, the type
// check, the unit tests, lint, knip, the production build, the end-to-end tests, and the API documentation's build
// and link check. Until v2.38.0 GitHub Actions ran these as `verify`; since v2.38.1 they run here, on the
// developer's machine, before a PR is opened and again on the merged main commit before it is released.
//
//   npm run verify            every check
//   npm run verify -- --fast  without the end-to-end tests and the API documentation, for a quick look while working
//
// Needs the local PostgreSQL (docker compose --env-file .env.local up -d --wait), Go 1.25 and Node.js 24. DATABASE_URL
// from .env.local is migrated and used by the DB tests and the end-to-end tests, which add rows under random owners
// and delete them afterwards. TYPLE_TEST_DATABASE_URL, when set, is used for the DB tests instead.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
require('@next/env').loadEnvConfig(root)

const fast = process.argv.includes('--fast')
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Set DATABASE_URL in .env.local (node scripts/setup-local.cjs) and start the database: ' +
    'docker compose --env-file .env.local up -d --wait')
  process.exit(1)
}
const testDatabaseUrl = process.env.TYPLE_TEST_DATABASE_URL || databaseUrl
const docsDir = path.join(root, 'api-docs')

/** @type {{ name: string, command: string, args: string[], env?: Record<string, string>, cwd?: string, check?: (stdout: string) => string | null }[]} */
const steps = [
  { name: 'db:migrate', command: 'npm', args: ['run', 'db:migrate'] },
  { name: 'migration tests', command: 'node', args: ['--test', 'tests/migrate.test.cjs'], env: { TYPLE_TEST_DATABASE_URL: testDatabaseUrl } },
  { name: 'gofmt', command: 'gofmt', args: ['-l', '.'], check: stdout => (stdout.trim() ? `Run gofmt -w on: ${stdout.trim()}` : null) },
  { name: 'go vet', command: 'go', args: ['vet', './...'] },
  { name: 'staticcheck', command: 'go', args: ['run', 'honnef.co/go/tools/cmd/staticcheck@v0.7.0', './...'], env: { GOTOOLCHAIN: 'go1.25.0' } },
  { name: 'go test', command: 'go', args: ['test', './...'], env: { TYPLE_TEST_DATABASE_URL: testDatabaseUrl } },
  { name: 'typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { name: 'unit tests', command: 'npm', args: ['test'] },
  { name: 'lint', command: 'npm', args: ['run', 'lint'] },
  { name: 'knip', command: 'npm', args: ['run', 'knip'] },
  { name: 'build', command: 'npm', args: ['run', 'build'] },
]
if (!fast) {
  steps.push({ name: 'end-to-end tests', command: 'npm', args: ['run', 'test:e2e'], env: { DATABASE_URL: databaseUrl } })
  if (!fs.existsSync(path.join(docsDir, 'node_modules'))) {
    steps.push({ name: 'api-docs: npm ci', command: 'npm', args: ['ci'], cwd: docsDir })
  }
  steps.push({ name: 'api-docs: build', command: 'npm', args: ['run', 'docs:build'], cwd: docsDir })
  steps.push({ name: 'api-docs: check links', command: 'npm', args: ['run', 'docs:check'], cwd: docsDir })
}

const started = Date.now()
for (const [index, step] of steps.entries()) {
  const label = `[${index + 1}/${steps.length}] ${step.name}`
  console.log(`\n=== ${label}: ${step.command} ${step.args.join(' ')}`)
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd ?? root,
    env: { ...process.env, ...step.env },
    stdio: step.check ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  })
  const failure = result.error ? result.error.message
    : result.status !== 0 ? `exited with ${result.status ?? `signal ${result.signal}`}`
    : step.check ? step.check(result.stdout) : null
  if (failure) {
    console.error(`\n${label} failed: ${failure}`)
    process.exit(1)
  }
}
console.log(`\nverify passed (${steps.length} checks${fast ? ', --fast' : ''}) in ${Math.round((Date.now() - started) / 1000)}s`)
