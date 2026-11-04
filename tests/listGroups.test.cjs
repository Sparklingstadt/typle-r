require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { saveList, encodeLists, decodeLists } = require('../src/core/wordLists.ts')
const { normalizeLibrary, validateLibrary } = require('../src/core/wordPacks.ts')
const { duplicateList, levelName, levelSteps, listAtLevels, matchesQuery } = require('../src/core/listOverview.ts')
const { validateLists } = require('../src/core/workspaceRequest.ts')
const { initialLists } = require('../src/plugins/packs/index.ts')

const words = [{ display: 'ls', input: 'ls', annotation: '' }]
const list = (id, group, levels) => ({ id, name: id, ...(group ? { group } : {}), ...(levels ? { levels } : {}), words, records: [], createdAt: '2026-10-24T00:00:00.000Z' })
const linux = [list('b1', 'Linux', ['基本', '初級']), list('b2', 'Linux', ['基本', '上級']), list('o1', 'Linux', ['オプション', '初級1']), list('o2', 'Linux', ['オプション', '初級2'])]

test('the levels of a group are chosen one step after another', () => {
  assert.deepEqual(levelSteps(linux, []), [{ options: ['基本', 'オプション'], chosen: null }])
  assert.deepEqual(levelSteps(linux, ['オプション']), [{ options: ['基本', 'オプション'], chosen: 'オプション' }, { options: ['初級1', '初級2'], chosen: null }])
  assert.deepEqual(levelSteps(linux, ['基本', '上級']).map(step => step.chosen), ['基本', '上級'])
  assert.equal(listAtLevels(linux, ['基本', '上級']).id, 'b2')
  assert.equal(listAtLevels(linux, ['基本']), undefined)
  // A list of the group without levels is its own choice.
  assert.equal(listAtLevels([...linux, list('x', 'Linux')], ['x']).id, 'x')
  assert.equal(levelName(linux[2]), 'オプション・初級1')
  assert.equal(levelName(list('x')), 'x')
})

test('the group and levels are saved trimmed, kept when read, refused past their limits and left out of a copy', () => {
  const [saved] = saveList([], { ...list('a', ' Linux ', [' 基本 ', '']) }, false)
  assert.deepEqual([saved.group, saved.levels], ['Linux', ['基本']])
  assert.equal('group' in saveList([], list('a', ' '), false)[0], false)
  assert.deepEqual(decodeLists(encodeLists(linux)), linux)
  for (const bad of [{ group: 1 }, { levels: '基本' }, { levels: [1] }]) {
    assert.throws(() => decodeLists(JSON.stringify({ version: 1, lists: [{ ...list('a'), ...bad }] })), { key: 'savedDataCorrupted' })
  }
  assert.throws(() => validateLists([list('a', 'g'.repeat(201))]))
  assert.throws(() => validateLists([list('a', 'g', ['1', '2', '3', '4', '5', '6'])]))
  const { copy } = duplicateList(linux, 'b1', 'c', n => `（${n}）`)
  assert.equal('group' in copy || 'levels' in copy, false)
  assert.equal(matchesQuery(linux[0], 'linux'), true)
})

test('a copy is named so that it does not overlap a level of its pack', () => {
  const at = '2026-10-01T00:00:00.000Z'
  const item = (id, name, levels) => ({ id, name, packId: 'p', words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: at, ...(levels ? { levels } : {}) })
  const suffix = n => n === 1 ? '（コピー）' : `（コピー${n}）`
  // The copy is picked by its name, so a first level equal to it would leave one of them out of reach.
  const lists = [item('a', '初級'), item('b', 'b', ['初級（コピー）', 'A']), item('c', 'c', ['初級（コピー2）'])]
  const { lists: next, copy } = duplicateList(lists, 'a', 'd', suffix)
  assert.equal(copy.name, '初級（コピー3）')
  const library = normalizeLibrary(next, [{ id: 'p', name: 'P', createdAt: at }])
  assert.equal(library.lists.find(list => list.id === 'd').name, copy.name)
  validateLibrary(library)
})

test('the initial lists split into levels are put in groups, each list with levels of its own', () => {
  // A group is the lists sharing a `group` (two or more of them); every other list stands alone.
  const byGroup = new Map()
  for (const item of initialLists) if (item.group) byGroup.set(item.group, [...byGroup.get(item.group) ?? [], item])
  const entries = initialLists.flatMap(item => {
    const members = item.group ? byGroup.get(item.group) : undefined
    if (!members || members.length < 2) return [{ group: null, items: [item] }]
    return members[0] === item ? [{ group: item.group, items: members }] : []
  })
  assert.equal(entries.length, 62)
  const groups = entries.filter(entry => entry.group)
  assert.equal(groups.length, 44)
  const kotlinGroup = groups.find(entry => entry.group === 'Kotlin構文')
  assert.deepEqual(levelSteps(kotlinGroup.items, [])[0].options, ['初級1', '初級2', '中級', '上級1', '上級2'])
  for (const entry of groups) {
    const paths = entry.items.map(item => item.levels.join('/'))
    assert.equal(new Set(paths).size, paths.length, entry.group)
    for (const item of entry.items) assert.equal(listAtLevels(entry.items, item.levels), item)
  }
  // The lists the sparklingstadt account keeps whole (since v0.85.0 the initial lists are its lists) are not grouped.
  assert.deepEqual(entries.filter(entry => !entry.group).map(entry => entry.items[0].id), [...initialLists.slice(0, 9).map(item => item.id), 'arch-linux', 'vim', 'un-member-states-chinese-193-lowercase', 'korean-basics', 'french-basics', 'czech-basics', 'german-basics', 'spanish-basics', 'chinese-basics'])
  validateLists(initialLists)
})
