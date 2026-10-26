require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { packOverviews } = require('../src/core/packEditing.ts')
const { packsByRecentPractice, packChoices, practiceName } = require('../src/core/packPractice.ts')

const stamp = '2026-10-01T00:00:00.000Z'
const words = [{ display: 'ls', input: 'ls', annotation: '' }]
const list = (id, packId, extra = {}) => ({ id, name: id, packId, words, records: [], createdAt: stamp, ...extra })
const pack = id => ({ id, name: id, createdAt: stamp })
const played = date => [{ time: 5, date }]

test('packsByRecentPractice puts the latest practiced first, then unpracticed packs in saved order', () => {
  const overviews = packOverviews({
    packs: [pack('n1'), pack('old'), pack('n2'), pack('new')],
    lists: [
      list('l1', 'n1'),
      list('l2', 'old', { records: played('2026-10-02T00:00:00.000Z') }),
      list('l3', 'n2'),
      list('l4', 'new', { records: played('2026-10-05T00:00:00.000Z') }),
    ],
  })
  assert.deepEqual(packsByRecentPractice(overviews).map(item => item.pack.id), ['new', 'old', 'n1', 'n2'])
  assert.deepEqual(overviews.map(item => item.pack.id), ['n1', 'old', 'n2', 'new'])
})

test('packChoices puts lists with levels first, each in saved order', () => {
  const [item] = packOverviews({
    packs: [pack('p')],
    lists: [list('x', 'p'), list('a', 'p', { levels: ['基本', '初級'] }), list('y', 'p'), list('b', 'p', { levels: ['基本', '上級'] })],
  })
  assert.deepEqual(packChoices(item).map(choice => choice.id), ['a', 'b', 'x', 'y'])
})

test('practiceName gives the pack and list parts only for lists in a group', () => {
  assert.deepEqual(practiceName({ name: 'x', group: 'Linux', levels: ['基本', '初級'] }), { pack: 'Linux', list: '基本・初級' })
  assert.deepEqual(practiceName({ name: 'リスト名', group: 'Linux' }), { pack: 'Linux', list: 'リスト名' })
  assert.deepEqual(practiceName({ name: 'リスト名' }), { list: 'リスト名' })
})
