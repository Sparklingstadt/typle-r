require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { decodeDevices, saveDevice, deviceLabel, deviceProblem, deviceUsage, MAX_DEVICES } = require('../src/lib/devices.ts')
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

test('device problems name the field to fix in Japanese', () => {
  const problem = (devices, value, editing = false) => deviceProblem(devices, { ...device, ...value }, editing)
  assert.equal(problem([], {}), null)
  assert.deepEqual(problem([], { name: '   ' }), { field: 'name', message: '端末名を入力してください。' })
  assert.equal(problem([], { name: 'x'.repeat(101) }).field, 'name')
  assert.equal(problem([], { layout: 'x'.repeat(201) }).field, 'layout')
  assert.deepEqual(problem([device], { id: 'other', name: ' macbook ' }), { field: 'name', message: '「MacBook」はすでに登録されています。別の名前にしてください。' })
  // Renaming a device to its own name, or only changing its case, is not a duplicate.
  assert.equal(problem([device], { name: 'macbook' }, true), null)
  assert.deepEqual(problem([], {}, true), { field: 'form', message: 'この端末は別の画面で削除されています。' })
  const many = Array.from({ length: MAX_DEVICES }, (_, index) => ({ id: `d${index}`, name: `Device ${index}`, layout: '' }))
  assert.equal(problem(many, { id: 'new', name: 'New' }).field, 'form')
  assert.equal(problem(many, { id: 'd0', name: 'Renamed' }, true), null)
  assert.throws(() => saveDevice([], { ...device, name: ' ' }, false), { message: '端末名を入力してください。' })
  assert.deepEqual(saveDevice([device], { ...device, name: ' MacBook Air ', layout: ' US ' }, true), [{ id: 'mac', name: 'MacBook Air', layout: 'US' }])
})

test('device usage counts records by device id, including renamed snapshots', () => {
  const lists = [
    { records: [{ date: '2026-09-01T00:00:00.000Z', device }, { date: '2026-09-20T00:00:00.000Z', device: { ...device, name: 'Old name' } }, { date: '2026-09-25T00:00:00.000Z' }] },
    { records: [{ date: '2026-09-10T00:00:00.000Z', device }, { date: '2026-09-05T00:00:00.000Z', device: { id: 'pc', name: 'PC', layout: '' } }] },
  ]
  const usage = deviceUsage(lists)
  assert.deepEqual(usage.get('mac'), { count: 3, lastUsed: '2026-09-20T00:00:00.000Z' })
  assert.deepEqual(usage.get('pc'), { count: 1, lastUsed: '2026-09-05T00:00:00.000Z' })
  assert.equal(usage.get('missing'), undefined)
  assert.equal(deviceUsage([]).size, 0)
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
