require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeLibrary, decodePacks, validateLibrary, viewLists, applyListChange } = require('../src/core/wordPacks.ts')
const { decodeLists, saveList } = require('../src/core/wordLists.ts')
const { levelSteps, listAtLevels } = require('../src/core/listOverview.ts')

const dir = path.join(__dirname, 'fixtures/packs')
for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
  test(`fixture ${file}`, () => {
    const { lists, packs, expected } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const result = normalizeLibrary(lists, packs)
    assert.deepEqual(result, expected)
    validateLibrary(result)
    // 変換・補正した結果をもう一度かけても変わらない。
    assert.deepEqual(normalizeLibrary(result.lists, result.packs), result)
  })
}

test('packs keep fields Typle does not know and refuse wrong shapes', () => {
  const pack = { id: 'p', name: 'P', createdAt: '2026-10-01T00:00:00.000Z', future: 1 }
  assert.deepEqual(decodePacks([pack]), [pack])
  for (const bad of [null, {}, [{ ...pack, id: 1 }], [{ ...pack, tags: 'x' }], [pack, pack]]) {
    assert.throws(() => decodePacks(bad), { key: 'savedDataCorrupted' })
  }
})

test('validateLibrary refuses what a save must not contain', () => {
  const list = { id: 'a', name: 'a', packId: 'p', words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: '2026-10-01T00:00:00.000Z' }
  const pack = { id: 'p', name: 'P', createdAt: '2026-10-01T00:00:00.000Z' }
  validateLibrary({ packs: [pack], lists: [list] })
  const many = Array.from({ length: 151 }, (_, i) => i)
  const cases = {
    'a list in a pack that does not exist': { packs: [pack, { ...pack, id: 'q', name: 'Q' }], lists: [{ ...list, packId: 'r' }, { ...list, id: 'b', name: 'b', packId: 'q' }, { ...list, id: 'c', name: 'c' }] },
    'a list without a packId': { packs: [pack], lists: [list, { ...list, id: 'b', name: 'b', packId: undefined }] },
    'a pack without lists': { packs: [pack, { ...pack, id: 'q', name: 'Q' }], lists: [list] },
    'two packs with one name': { packs: [pack, { ...pack, id: 'q', name: ' p ' }], lists: [list, { ...list, id: 'b', name: 'b', packId: 'q' }] },
    'two packs with one id': { packs: [pack, { ...pack, name: 'Q' }], lists: [list] },
    'a blank pack name': { packs: [{ ...pack, name: ' ' }], lists: [list] },
    'a pack name over the limit': { packs: [{ ...pack, name: 'n'.repeat(201) }], lists: [list] },
    'a description over the limit': { packs: [{ ...pack, description: 'd'.repeat(501) }], lists: [list] },
    'a category over the limit': { packs: [{ ...pack, category: 'c'.repeat(51) }], lists: [list] },
    'a tag over the limit': { packs: [{ ...pack, tags: ['t'.repeat(51)] }], lists: [list] },
    'more tags than the limit': { packs: [{ ...pack, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }], lists: [list] },
    'a list name repeated in a pack': { packs: [pack], lists: [list, { ...list, id: 'b', name: 'A' }] },
    'a list with a group': { packs: [pack], lists: [{ ...list, group: 'g' }] },
    'a list with a category': { packs: [pack], lists: [{ ...list, category: 'c' }] },
    'a list with tags': { packs: [pack], lists: [{ ...list, tags: ['t'] }] },
  }
  for (const [reason, library] of Object.entries(cases)) assert.throws(() => validateLibrary(library), { message: 'Invalid packs' }, reason)
  // Packs have no limit of their own: every pack has a list, so the list limit bounds them.
  validateLibrary({ packs: many.map(i => ({ ...pack, id: `p${i}`, name: `P${i}` })), lists: many.map(i => ({ ...list, id: `l${i}`, name: `l${i}`, packId: `p${i}` })) })
})

test('validateLibrary refuses lists of a pack whose levels overlap, as levelsConflict', () => {
  const list = { id: 'a', name: 'a', packId: 'p', words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: '2026-10-01T00:00:00.000Z' }
  const packs = [{ id: 'p', name: 'P', createdAt: '2026-10-01T00:00:00.000Z' }, { id: 'q', name: 'Q', createdAt: '2026-10-01T00:00:00.000Z' }]
  const cases = {
    'equal levels': [{ ...list, levels: ['初級'] }, { ...list, id: 'b', name: 'b', levels: ['初級'] }],
    'one the start of the other': [{ ...list, levels: ['中級1', 'A'] }, { ...list, id: 'b', name: 'b', levels: ['中級1'] }],
    'a name equal to a level': [{ ...list, name: '初級' }, { ...list, id: 'b', name: 'b', levels: ['初級'] }],
  }
  for (const [reason, lists] of Object.entries(cases)) {
    assert.throws(() => validateLibrary({ packs, lists: [...lists, { ...list, id: 'z', name: 'z', packId: 'q' }] }), { key: 'levelsConflict' }, reason)
  }
  // Paths are compared as they are, and only within a pack.
  validateLibrary({ packs, lists: [{ ...list, levels: ['初級'] }, { ...list, id: 'b', name: 'b', levels: ['初級 '] }, { ...list, id: 'c', name: 'c', levels: ['中級', 'A'] },
    { ...list, id: 'd', name: 'd', levels: ['中級', 'B'] }, { ...list, id: 'e', name: 'e', packId: 'q', levels: ['初級'] }] })
})

test('every list of a pack whose levels were separated can be picked on the practice screen', () => {
  for (const file of fs.readdirSync(dir).filter(name => name.startsWith('levels-'))) {
    const { lists, packs } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const result = normalizeLibrary(lists, packs)
    for (const pack of result.packs) {
      const mine = result.lists.filter(list => list.packId === pack.id)
      for (const list of mine) {
        const chosen = list.levels?.length ? list.levels : [list.name]
        assert.deepEqual(levelSteps(mine, chosen).map(step => step.chosen), chosen, `${file} ${list.id}`)
        assert.equal(listAtLevels(mine, chosen), mine.find(item => item.id === list.id), `${file} ${list.id}`)
      }
    }
  }
})

test('a level or name with （n） stays within its limit', () => {
  const at = '2026-10-01T00:00:00.000Z'
  const list = (id, fields) => ({ id, name: id, words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: at, packId: 'p', ...fields })
  const lists = Array.from({ length: 12 }, (_, i) => list(`l${i}`, { levels: ['a'.repeat(50)] }))
  const result = normalizeLibrary(lists, [{ id: 'p', name: 'P', createdAt: at }])
  assert.equal(result.lists[11].levels[0], `${'a'.repeat(46)}（12）`)
  assert.ok(result.lists.every(item => item.levels[0].length <= 50))
  validateLibrary(result)
})

test('a library of more lists than MAX_LISTS, all without a group, converts and passes validateLibrary', () => {
  // Accounts merged from removed profiles may hold more than 150 lists; each becomes a one-list pack.
  const lists = Array.from({ length: 151 }, (_, i) => ({ id: `l${i}`, name: `l${i}`, words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: '2026-10-01T00:00:00.000Z' }))
  const library = normalizeLibrary(lists, null)
  assert.equal(library.packs.length, 151)
  validateLibrary(library)
})

test('lists keep a packId and refuse one that is not a string', () => {
  const list = { id: 'a', name: 'a', packId: 'p', words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: '2026-10-01T00:00:00.000Z' }
  assert.equal(decodeLists(JSON.stringify({ version: 1, lists: [list] }))[0].packId, 'p')
  assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list, packId: 1 }] })), { key: 'savedDataCorrupted' })
  assert.equal(saveList([list], { ...list, name: 'b' }, true)[0].packId, 'p')
})

const w = [{ display: 'ls', input: 'ls', annotation: '' }]
const at = '2026-10-01T00:00:00.000Z'
const library = {
  packs: [{ id: 'p', name: 'Linux', category: 'プログラミング', tags: ['Linux'], createdAt: at }, { id: 'q', name: 'Solo', createdAt: at }],
  lists: [{ id: 'a', name: 'a', packId: 'p', levels: ['基本'], words: w, records: [], createdAt: at },
          { id: 'b', name: 'b', packId: 'p', words: w, records: [], createdAt: at },
          { id: 's', name: 'Solo', packId: 'q', words: w, records: [], createdAt: at }],
}

test('viewLists gives each list its pack labels, and a group only in a pack of two or more', () => {
  const [a, , s] = viewLists(library)
  assert.deepEqual([a.group, a.category, a.tags, a.packId], ['Linux', 'プログラミング', ['Linux'], 'p'])
  assert.equal('group' in s, false)
  assert.equal('category' in s || 'tags' in s, false)
  assert.equal('group' in library.lists[0], false)
})

test('viewLists gives a list with levels its group even when it is alone in its pack', () => {
  const solo = { packs: [{ id: 'p', name: 'Linux', createdAt: at }, { id: 'q', name: 'Plain', createdAt: at }],
    lists: [{ id: 'a', name: 'a', packId: 'p', levels: ['基本'], words: w, records: [], createdAt: at },
            { id: 'b', name: 'b', packId: 'q', words: w, records: [], createdAt: at }] }
  const [a, b] = viewLists(solo)
  assert.equal(a.group, 'Linux')
  assert.equal('group' in b, false)
  assert.deepEqual(applyListChange(solo, viewLists(solo)), solo)
})

test('applyListChange puts edits back into the packs', () => {
  const view = viewLists(library)
  // ラベルの変更はパックへ。
  let next = applyListChange(library, view.map(list => list.id === 'b' ? { ...list, tags: ['Linux', 'zsh'] } : list))
  assert.deepEqual(next.packs[0].tags, ['Linux', 'zsh'])
  assert.equal(next.lists.some(list => 'tags' in list || 'group' in list || 'category' in list), false)
  // packId のない新しいリストは1リストのパックになる。
  next = applyListChange(library, [...view, { id: 'n', name: 'New', category: 'X', words: w, records: [], createdAt: at }])
  assert.deepEqual(next.packs.at(-1), { id: 'pack-n', name: 'New', category: 'X', createdAt: at })
  // 1リストだけのパックは、リストの改名についていく。
  next = applyListChange(library, view.map(list => list.id === 's' ? { ...list, name: 'Renamed' } : list))
  assert.equal(next.packs[1].name, 'Renamed')
  next = applyListChange(library, view.map(list => list.id === 'a' ? { ...list, name: 'a2' } : list))
  assert.equal(next.packs[0].name, 'Linux')
  // 最後のリストを消すとパックも消える。
  next = applyListChange(library, view.filter(list => list.id !== 's'))
  assert.deepEqual(next.packs.map(pack => pack.id), ['p'])
  validateLibrary(next)
})

test('applyListChange leaves an unchanged view as it was, and clears labels the view dropped', () => {
  assert.deepEqual(applyListChange(library, viewLists(library)), library)
  // With one list left in the pack, clearing its labels clears the pack's.
  const next = applyListChange(library, viewLists(library).filter(list => list.id !== 'b').map(list => list.id === 'a' ? { ...list, category: ' ', tags: [] } : list))
  assert.equal('category' in next.packs[0] || 'tags' in next.packs[0], false)
})

test('applyListChange: clearing the labels of one list in a pack clears the pack', () => {
  const next = applyListChange(library, viewLists(library).map(list => list.id === 'b' ? { ...list, category: undefined, tags: undefined } : list))
  assert.equal('category' in next.packs[0] || 'tags' in next.packs[0], false)
  validateLibrary(next)
})
