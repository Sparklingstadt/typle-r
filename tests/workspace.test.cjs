require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { LegacyProfileRequest, validateWorkspaceRequest } = require('../src/core/workspaceRequest.ts')
const { prepareLegacy, mergeLegacy } = require('../src/plugins/formats/legacy.ts')
const list = { id: 'one', name: 'One', createdAt: '2026-09-06', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }

test('migration is explicit, repeatable and preserves colliding names and records', async () => {
  const source = [{ ...list, records: [{ id: 'r', date: '2026-09-06', time: 1 }] }]
  const incoming = await prepareLegacy(source)
  const suffix = n => `（移行 ${n}）`
  const merged = mergeLegacy([list], incoming, suffix)
  assert.equal(merged.length, 2)
  assert.equal(merged[1].name, 'One（移行 2）')
  assert.equal(merged[1].records.length, 1)
  assert.deepEqual(mergeLegacy(merged, await prepareLegacy(source), suffix), merged)
  assert.equal(source[0].id, 'one')
})

test('request validation drops sharing fields sent by older screens', () => {
  const [sent] = validateWorkspaceRequest({ revision: 1, lists: [{ ...list, shared: true, shareId: 'x' }] }).lists
  assert.equal('shared' in sent, false)
  assert.equal('shareId' in sent, false)
})

test('request validation rejects invalid revisions and oversized fields', () => {
  for (const revision of [-1, 1.5, '0', NaN]) assert.throws(() => validateWorkspaceRequest({ revision, lists: [] }))
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...list, name: 'a'.repeat(201) }] }))
  // The app with profiles names the first profile in every save; that is the only list set now.
  assert.deepEqual(validateWorkspaceRequest({ revision: 0, profileId: 'default', lists: [list] }), { revision: 0, lists: [list] })
  for (const body of [{ profileId: 'zh', lists: [] }, { profileId: 'default', profiles: [{ id: 'default', name: 'メイン' }] }]) {
    assert.throws(() => validateWorkspaceRequest({ revision: 1, ...body }), LegacyProfileRequest)
  }
  // The number of lists is checked against the saved ones (see workspaceDocument), so merged lists above it can be saved.
  const many = Array.from({ length: 101 }, (_, index) => ({ ...list, id: 'l' + index, name: 'L' + index }))
  assert.equal(validateWorkspaceRequest({ revision: 1, lists: many }).lists.length, 101)
})
