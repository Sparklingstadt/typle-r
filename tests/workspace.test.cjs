require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { validateWorkspaceRequest } = require('../src/core/workspaceRequest.ts')
const list = { id: 'one', name: 'One', createdAt: '2026-09-06', words: [{ display: 'a', input: 'a', annotation: '' }], records: [] }

test('request validation drops sharing fields sent by older screens', () => {
  const [sent] = validateWorkspaceRequest({ revision: 1, lists: [{ ...list, shared: true, shareId: 'x' }] }).lists
  assert.equal('shared' in sent, false)
  assert.equal('shareId' in sent, false)
})

test('request validation rejects invalid revisions and oversized fields', () => {
  for (const revision of [-1, 1.5, '0', NaN]) assert.throws(() => validateWorkspaceRequest({ revision, lists: [] }))
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...list, name: 'a'.repeat(201) }] }))
  // Saves of the app from when it had profiles are no longer taken.
  for (const body of [{ profileId: 'default', lists: [list] }, { profileId: 'zh', lists: [] }, { profiles: [{ id: 'default', name: 'メイン' }] }]) {
    assert.throws(() => validateWorkspaceRequest({ revision: 1, ...body }), { message: 'Invalid request' })
  }
  // The number of lists is checked against the saved ones (see workspaceDocument), so lists above it can be kept.
  const many = Array.from({ length: 101 }, (_, index) => ({ ...list, id: 'l' + index, name: 'L' + index }))
  assert.equal(validateWorkspaceRequest({ revision: 1, lists: many }).lists.length, 101)
})

test('request validation takes packs only together with lists', () => {
  const pack = { id: 'p', name: 'P', createdAt: '2026-09-06' }
  const saved = { ...list, packId: 'p' }
  assert.throws(() => validateWorkspaceRequest({ revision: 0, packs: [pack] }), { message: 'Invalid request' })
  assert.deepEqual(validateWorkspaceRequest({ revision: 0, lists: [saved], packs: [pack] }), { revision: 0, lists: [saved], packs: [pack] })
  // Lists sent without packs are each put in a pack of their own when the change is applied (see workspaceDocument).
  assert.equal(validateWorkspaceRequest({ revision: 0, lists: [{ ...list, group: 'G', category: 'C', tags: ['t'] }] }).packs, undefined)
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...saved, packId: 'missing' }], packs: [pack] }), { message: 'Invalid packs' })
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...saved, group: 'G' }], packs: [pack] }), { message: 'Invalid packs' })
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [saved], packs: [pack, { ...pack, id: 'q' }] }), { message: 'Invalid packs' })
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [saved], packs: {} }), { key: 'savedDataCorrupted' })
  // Lists of a pack whose levels overlap are refused; lists sent without packs are each in a pack of their own.
  const overlapping = [{ ...saved, levels: ['初級'] }, { ...saved, id: 'b', name: 'b', levels: ['初級'] }]
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: overlapping, packs: [pack] }), { key: 'levelsConflict' })
  assert.equal(validateWorkspaceRequest({ revision: 0, lists: overlapping }).lists.length, 2)
  // A list with more than one level is refused with packs; up to 5 sent without packs are joined into one.
  const leveled = [{ ...saved, levels: ['基本', '初級'] }]
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: leveled, packs: [pack] }), { key: 'tooManyLevels' })
  assert.equal(validateWorkspaceRequest({ revision: 0, lists: [{ ...saved, levels: ['1', '2', '3', '4', '5'] }] }).lists.length, 1)
  assert.throws(() => validateWorkspaceRequest({ revision: 0, lists: [{ ...saved, levels: ['1', '2', '3', '4', '5', '6'] }] }), { message: 'Workspace too large' })
})
