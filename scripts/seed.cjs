const { loadEnvConfig } = require('@next/env')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

const countries = require('../src/plugins/packs/countries.json')

const templates = [
  { id: 'seed-test-1', name: 'Test 1', words: ['hoge', 'foo', 'bar'] },
  { id: 'seed-test-2', name: 'test 2', words: ['one', 'two', 'three'] },
  countries,
]

async function applySeed(tx, ownerId) {
  const existing = await tx.workspace.findUnique({ where: { ownerId } })
  const lists = existing?.lists ?? []
  if (!Array.isArray(lists)) throw new Error('Existing workspace is invalid')
  // Preserve user edits and records, including older lists with the same name.
  const missing = templates.filter(template => !lists.some(list =>
    list.id === template.id || list.name?.trim().toLowerCase() === template.name.toLowerCase()))
  if (!missing.length) return 0
  const createdAt = new Date().toISOString()
  const additions = missing.map(template => ({
    id: template.id, name: template.name, createdAt, records: [],
    words: template.words.map(word => typeof word === 'string'
      ? { display: word, input: word, annotation: '' } : { ...word }),
  }))
  if (existing) {
    await tx.workspace.update({ where: { ownerId, revision: existing.revision },
      data: { lists: [...lists, ...additions], revision: { increment: 1 }, updatedAt: new Date() } })
  } else {
    await tx.workspace.create({ data: { ownerId, lists: additions } })
  }
  return additions.length
}

async function seedWorkspace(client, ownerId) {
  if (!/^github:\d+$/.test(ownerId ?? '')) throw new Error('Specify --owner github:<numeric GitHub user ID>')
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await client.$transaction(tx => applySeed(tx, ownerId), { isolationLevel: 'Serializable', maxWait: 30000, timeout: 60000 })
    } catch (error) {
      if (!['P2034', 'P2002', 'P2025'].includes(error.code) || attempt === 4) throw error
    }
  }
}

async function main() {
  loadEnvConfig(process.cwd())
  const args = process.argv.slice(2)
  const ownerId = args[args.indexOf('--owner') + 1]
  if (!args.includes('--owner') || !/^github:\d+$/.test(ownerId ?? '')) {
    throw new Error('Usage: npm run db:seed -- --owner github:<numeric GitHub user ID>')
  }
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!connectionString) throw new Error('Database URL is not configured')
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  try {
    const added = await seedWorkspace(client, ownerId)
    console.log(`Seed complete: ${added} lists added for ${ownerId}. Existing lists preserved.`)
  } finally { await client.$disconnect() }
}

module.exports = { seedWorkspace, applySeed }
if (require.main === module) main().catch(() => {
  console.error('Seed failed. Check the DB connection and --owner github:<numeric GitHub user ID>.')
  process.exitCode = 1
})
