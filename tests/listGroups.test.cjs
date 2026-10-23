require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { saveList, encodeLists, decodeLists } = require('../src/core/wordLists.ts')
const { duplicateList, groupEntries, levelName, levelSteps, listAtLevels, matchesQuery } = require('../src/core/listOverview.ts')
const { validateLists } = require('../src/core/workspaceRequest.ts')
const { initialLists } = require('../src/plugins/packs/index.ts')

const words = [{ display: 'ls', input: 'ls', annotation: '' }]
const list = (id, group, levels) => ({ id, name: id, ...(group ? { group } : {}), ...(levels ? { levels } : {}), words, records: [], createdAt: '2026-10-24T00:00:00.000Z' })
const linux = [list('b1', 'Linux', ['基本', '初級']), list('b2', 'Linux', ['基本', '上級']), list('o1', 'Linux', ['オプション', '初級1']), list('o2', 'Linux', ['オプション', '初級2'])]

test('the lists of a group are one entry, at the place of the first of them', () => {
  const items = [list('a'), linux[2], list('go1', 'Go', ['初級']), linux[0], list('one', 'Alone', ['初級']), linux[1]]
  assert.deepEqual(groupEntries(items, item => item).map(entry => [entry.group, entry.items.map(item => item.id)]), [
    [null, ['a']], ['Linux', ['o1', 'b1', 'b2']], [null, ['go1']], [null, ['one']],
  ])
  // A search that finds one list of a group still shows it in its group.
  assert.deepEqual(groupEntries([linux[1]], item => item, linux).map(entry => entry.group), ['Linux'])
})

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

test('the initial lists split into levels are put in groups, each list with levels of its own', () => {
  const entries = groupEntries(initialLists, item => item)
  assert.equal(entries.length, 27)
  const groups = entries.filter(entry => entry.group)
  assert.equal(groups.length, 23)
  const linuxGroup = groups.find(entry => entry.group === 'Linuxコマンド')
  assert.deepEqual(levelSteps(linuxGroup.items, [])[0].options, ['基本', 'オプション', '応用'])
  assert.deepEqual(levelSteps(linuxGroup.items, ['応用'])[1].options, ['初級', '中級1', '中級2', '上級'])
  for (const entry of groups) {
    const paths = entry.items.map(item => item.levels.join('/'))
    assert.equal(new Set(paths).size, paths.length, entry.group)
    for (const item of entry.items) assert.equal(listAtLevels(entry.items, item.levels), item)
  }
  assert.deepEqual(entries.filter(entry => !entry.group).map(entry => entry.items[0].id), ['sample-1', 'sample-2', 'vercel-cli', 'gcloud-cli'])
  validateLists(initialLists)
})

test('migration 0022 puts the initial lists in saved workspaces in their groups, unless they have one', () => {
  const fs = require('node:fs')
  const sql = fs.readFileSync(require.resolve('../prisma/migrations/0022_group_initial_lists/migration.sql'), 'utf8')
  const pack = JSON.parse(sql.match(/jsonb_array_elements\('(.*)'::jsonb\)/)[1].replaceAll("''", "'"))
  assert.deepEqual(pack, initialLists.filter(item => item.group).map(({ id, group, levels }) => ({ id, group, levels })))
  assert.match(sql, /saved\.list->'group' IS NULL AND saved\.list->'levels' IS NULL/)
  assert.match(sql, /octet_length\(rebuilt\.lists::text\) <= 896 \* 1024;/)
})
