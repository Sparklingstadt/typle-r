// The steps of migration 0023_seed_initial_lists, each under the name of the migration it was (0009 to 0022).
const fs = require('node:fs')

const sql = fs.readFileSync(require.resolve('../prisma/migrations/0023_seed_initial_lists/migration.sql'), 'utf8')
const parts = sql.split(/^-- (\d{4}_[a-z_]+)\n/m)
const steps = new Map()
for (let index = 1; index < parts.length; index += 2) steps.set(parts[index], parts[index + 1])

const step = name => {
  if (!steps.has(name)) throw new Error(`No step ${name}`)
  return steps.get(name)
}
// The lists a step adds, or the items it reads, as its JSON literal gives them.
const pack = name => JSON.parse(step(name).match(/jsonb_array_elements\('(.*)'::jsonb\)/)[1].replaceAll("''", "'"))

module.exports = { names: [...steps.keys()], step, pack }
