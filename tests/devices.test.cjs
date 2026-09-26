require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { decodeDevices, saveDevice, deviceLabel } = require('../src/lib/devices.ts')
const { decodeLists } = require('../src/lib/wordLists.ts')
const { validateWorkspaceRequest } = require('../src/lib/workspaceRequest.ts')
const { makeRecord } = require('../src/lib/records.ts')
const device = { id: 'mac', name: 'MacBook', layout: 'JIS' }

test('device validation rejects malformed, duplicate and oversized data', () => {
  assert.deepEqual(decodeDevices([{ ...device, name: ' MacBook ' }]), [device])
  for (const data of [null, {}, [null], [device, device], [{ ...device, name: ' ' }], [{ ...device, layout: 3 }], [{ ...device, id: 'x'.repeat(101) }], [{ ...device, name: 'x'.repeat(101) }], [{ ...device, layout: 'x'.repeat(201) }]]) {
    assert.throws(() => decodeDevices(data))
    assert.throws(() => validateWorkspaceRequest({ revision: 1, lists: [], devices: data }))
  }
  assert.throws(() => saveDevice([device], { ...device, id: 'other', name: 'macbook' }, false))
  assert.throws(() => saveDevice([], device, true))
  assert.equal(deviceLabel(), '未記録')
})

test('records snapshot the device and remain compatible with legacy data', () => {
  const source = { ...device }
  const record = makeRecord({ startedAt: 1000, finishedAt: 2000, attempts: 1, mistakes: 0 }, 1, 'record', source)
  source.name = 'Renamed'
  assert.deepEqual(record.device, device)
  const list = { id: 'list', name: 'List', createdAt: '2026-09-27', words: [{ display: 'a', input: 'a', annotation: '' }], records: [record] }
  const decode = records => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, records }] }))
  assert.deepEqual(decode([record])[0].records[0].device, device)
  assert.equal(decode([{ time: 1, date: '2026-09-27' }])[0].records[0].device, undefined)
  assert.throws(() => decode([{ ...record, device: { name: 'invalid' } }]))
})
