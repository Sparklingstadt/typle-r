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

test('request validation takes packs only together with lists', () => {
  const pack = { id: 'p', name: 'P', createdAt: '2026-09-06' }
  const saved = { ...list, packId: 'p' }
  assert.throws(() => validateWorkspaceRequest({ revision: 0, packs: [pack] }), { message: 'Invalid request' })
  assert.deepEqual(validateWorkspaceRequest({ revision: 0, lists: [saved], packs: [pack] }), { revision: 0, lists: [saved], packs: [pack] })
  // A save from a screen that does not know packs has no packs, and may still carry labels on its lists.
  assert.equal(validateWorkspaceRequest({ revision: 0, lists: [{ ...list, group: 'G', category: 'C', tags: ['t'] }] }).packs, undefined)
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...saved, packId: 'missing' }], packs: [pack] }), { message: 'Invalid packs' })
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...saved, group: 'G' }], packs: [pack] }), { message: 'Invalid packs' })
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [saved], packs: [pack, { ...pack, id: 'q' }] }), { message: 'Invalid packs' })
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [saved], packs: {} }), { key: 'savedDataCorrupted' })
  // Lists of a pack whose levels overlap are refused; lists sent without packs are separated when they are read.
  const overlapping = [{ ...saved, levels: ['初級'] }, { ...saved, id: 'b', name: 'b', levels: ['初級'] }]
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: overlapping, packs: [pack] }), { key: 'levelsConflict' })
  assert.equal(validateWorkspaceRequest({ revision: 0, lists: overlapping }).lists.length, 2)
  // A list with more than one level is refused with packs; an app before v0.97.0 sends up to 5 without packs, which are
  // joined when they are read.
  const leveled = [{ ...saved, levels: ['基本', '初級'] }]
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: leveled, packs: [pack] }), { key: 'tooManyLevels' })
  assert.equal(validateWorkspaceRequest({ revision: 0, lists: [{ ...saved, levels: ['1', '2', '3', '4', '5'] }] }).lists.length, 1)
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...saved, levels: ['1', '2', '3', '4', '5', '6'] }] }), { message: 'Workspace too large' })
})
