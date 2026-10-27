const { spawnSync } = require('node:child_process')
const path = require('node:path')
const cli = path.join(__dirname, '../node_modules/prisma/build/index.js')
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status || 1)
}
if (process.argv.includes('--baseline')) {
  // Compare the legacy database with the table of v0.3.x, then bring it up to date with 0027_schema, which changes only
  // what is missing, and record that migration as applied.
  run(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/baseline.prisma', '--exit-code'])
  run(['db', 'execute', '--file', 'prisma/migrations/0027_schema/migration.sql'])
  run(['migrate', 'resolve', '--applied', '0027_schema'])
}
run(['migrate', 'deploy'])
