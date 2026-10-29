require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createWorkspaceSession } = require('../src/core/workspaceSession.ts')

// docs/api/workspace-records.openapi.json is the contract of /api/workspace/records, which
// server/internal/web/records_test.go holds the Go handler to. These hold the app to it.
const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/api/workspace-records.openapi.json'), 'utf8'))
const schemas = contract.components.schemas

test('every error the contract declares has a message in every language the app shows', () => {
  const keys = new Set()
  for (const operation of Object.values(contract.paths['/api/workspace/records'])) {
    // A response the app never gets (x-app-shows: false), such as to a method it does not send, has no message.
    for (const response of Object.values(operation.responses).filter(response => response['x-app-shows'] !== false)) {
      for (const key of response.content?.['application/json']?.schema?.properties?.error?.enum ?? []) keys.add(key)
    }
  }
  assert.ok(keys.size > 5)
  const messages = path.join(__dirname, '../src/messages')
  for (const language of fs.readdirSync(messages)) {
    const errors = JSON.parse(fs.readFileSync(path.join(messages, language, 'errors.json'), 'utf8'))
    for (const key of keys) assert.ok(key in errors, `${language}: ${key}`)
  }
})

// The checks of RecordInput the shared fixtures can break: the fields it declares and those it requires.
function checkRecordInput(input, where) {
  const { properties, required } = schemas.RecordInput
  for (const name of Object.keys(input)) assert.ok(name in properties, `${where}: ${name} is not a field of RecordInput`)
  for (const name of required) assert.ok(name in input, `${where}: ${name} is required`)
  assert.ok(!('deviceId' in input && 'device' in input) || where.includes('both'), `${where}: deviceId and device together`)
}

test('the shared record fixtures send records the contract describes', () => {
  const fixtures = path.join(__dirname, 'fixtures')
  for (const file of fs.readdirSync(path.join(fixtures, 'records')).filter(name => name.endsWith('.json'))) {
    checkRecordInput(JSON.parse(fs.readFileSync(path.join(fixtures, 'records', file), 'utf8')).input, `records/${file}`)
  }
  for (const file of fs.readdirSync(path.join(fixtures, 'record-operations')).filter(name => name.endsWith('.json'))) {
    const { steps } = JSON.parse(fs.readFileSync(path.join(fixtures, 'record-operations', file), 'utf8'))
    steps.filter(step => step.op === 'add').forEach((step, i) => checkRecordInput(step.input, `record-operations/${file} step ${i}`))
  }
})

test('the app sends the request bodies the contract declares', async () => {
  const requests = {}
  const answer = { accountId: 'github:1', revision: 2, lists: [], packs: [], devices: [], interests: [] }
  const store = {
    location: 'account', staleReads: true,
    read: async () => ({ ...answer, revision: 1 }),
    write: async () => answer,
    addRecord: async request => { requests.add = request; return answer },
    deleteRecord: async request => { requests.delete = request; return { ...answer, revision: 3 } },
  }
  const session = createWorkspaceSession({ store, accountId: 'github:1', initialLibrary: { lists: [], packs: [] }, show: () => {}, saving: () => {} })
  await session.load()
  const record = { id: 'r1', time: 1, date: '2026-10-01T00:00:00.000Z', mistakes: 0, accuracy: 100, wordCount: 1, device: { id: 'mac', name: 'Mac', layout: '' } }
  assert.equal(await session.addRecord('l1', record), true)
  assert.equal(await session.deleteRecord('l1', 'r1'), true)
  assert.deepEqual(Object.keys(requests.add).sort(), Object.keys(schemas.RecordAdd.properties).sort())
  assert.deepEqual(Object.keys(requests.delete).sort(), Object.keys(schemas.RecordDelete.properties).sort())
  checkRecordInput(requests.add.record, 'the practice screen')
  assert.ok(requests.add.record.id, 'the app always sends the id, so a run can be sent again safely')
})
