require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validateLibrary } = require('../src/core/wordPacks.ts')
const { packOverviews, matchesPackQuery, matchingListIds, createPack, updatePack, reorderPackLists, deletePack, saveListInPack } = require('../src/core/packEditing.ts')
const { duplicateList, MAX_LISTS } = require('../src/core/listOverview.ts')
const { saveList } = require('../src/core/wordLists.ts')

const words = (...texts) => texts.map(text => ({ display: text, input: text.toLowerCase(), annotation: '' }))
const stamp = '2026-10-01T00:00:00.000Z'
const list = (id, name, packId, extra = {}) => ({ id, name, packId, words: words('ls'), records: [], createdAt: stamp, ...extra })
const library = () => ({
  packs: [
    { id: 'p', name: 'Linux', category: 'プログラミング', tags: ['Linux'], createdAt: stamp },
    { id: 'q', name: 'Go', createdAt: stamp },
  ],
  lists: [
    list('a', '基本', 'p', { words: words('ls', 'cat'), records: [{ time: 5, date: '2026-10-05T00:00:00.000Z' }], createdAt: '2026-09-01T00:00:00.000Z' }),
    list('g', '基本', 'q', { words: words('go') }),
    list('b', '応用', 'p', { words: words('grep') }),
  ],
})
const ids = lib => lib.lists.map(item => item.id)
const input = (id, name, extra = {}) => ({ id, name, words: words('x'), createdAt: stamp, ...extra })

test('packOverviews gives each pack its lists in saved order, with totals', () => {
  const [p, q] = packOverviews(library())
  assert.deepEqual(p.lists.map(item => item.list.id), ['a', 'b'])
  assert.deepEqual([p.position, p.wordCount, p.practiceCount, p.practicedListCount, p.lastPracticed], [0, 3, 1, 1, Date.parse('2026-10-05T00:00:00.000Z')])
  assert.equal(p.lists[0].list.category, 'プログラミング')
  assert.deepEqual([q.position, q.practiceCount, q.practicedListCount, q.lastPracticed], [1, 0, 0, null])
})

test('a pack is found by its name, labels, list names and words; matchingListIds names the lists found', () => {
  const [p] = packOverviews(library())
  for (const query of ['linux', 'プログラ', '応用', 'GREP', ' cat ', '']) assert.equal(matchesPackQuery(p, query), true, query)
  assert.equal(matchesPackQuery(p, 'go'), false)
  assert.deepEqual(matchingListIds(p, '応用'), ['b'])
  assert.deepEqual(matchingListIds(p, 'cat'), ['a'])
  assert.deepEqual(matchingListIds(p, 'linux'), [])
  assert.deepEqual(matchingListIds(p, ''), [])
})

test('createPack adds a pack and its first list at the end', () => {
  const next = createPack(library(), { name: ' New ', description: ' ', category: ' c ', tags: ['t', 'T'] }, input('n', ' First '), 'pn', new Date('2026-10-02T00:00:00Z'))
  validateLibrary(next)
  assert.deepEqual(next.packs.at(-1), { id: 'pn', name: 'New', category: 'c', tags: ['t'], createdAt: '2026-10-02T00:00:00.000Z' })
  assert.deepEqual(next.lists.at(-1), { ...input('n', 'First'), packId: 'pn', records: [] })
  assert.throws(() => createPack(library(), { name: ' linux ' }, input('n', 'N'), 'pn'), { key: 'packNameDuplicate' })
  assert.throws(() => createPack(library(), { name: ' ' }, input('n', 'N'), 'pn'), { key: 'packNameRequired' })
  assert.throws(() => createPack(library(), { name: 'x'.repeat(201) }, input('n', 'N'), 'pn'), { message: 'Invalid packs' })
  assert.throws(() => createPack(library(), { name: 'N' }, input('n', ' '), 'pn'), { key: 'listNameRequired' })
  const full = { packs: [], lists: [] }
  for (let i = 0; i < MAX_LISTS; i++) {
    full.packs.push({ id: `p${i}`, name: `P${i}`, createdAt: stamp })
    full.lists.push(list(`l${i}`, `l${i}`, `p${i}`))
  }
  assert.throws(() => createPack(full, { name: 'N' }, input('n', 'N'), 'pn'), { key: 'listLimit', values: { max: MAX_LISTS } })
  // Lists of followed packs are not counted.
  const followed = { packs: full.packs.map((pack, i) => i < 10 ? { ...pack, origin: { catalogId: pack.id, version: 1, followed: true } } : pack),
    lists: full.lists }
  assert.equal(createPack(followed, { name: 'N' }, input('n', 'N'), 'pn').packs.at(-1).id, 'pn')
})

test('createPack keeps the first list\'s levels, tidied', () => {
  const next = createPack(library(), { name: 'New' }, input('n', 'First', { levels: [' 基本 ', '', '  '] }), 'pn')
  assert.deepEqual(next.lists.at(-1).levels, ['基本'])
  const none = createPack(library(), { name: 'New' }, input('n', 'First', { levels: [' ', ''] }), 'pn')
  assert.equal('levels' in none.lists.at(-1), false)
})

test('updatePack changes name, description and labels, and checks the name against other packs', () => {
  const next = updatePack(library(), 'p', { name: 'Linux2', description: 'd', category: '', tags: ['x'] })
  assert.deepEqual(next.packs[0], { id: 'p', name: 'Linux2', description: 'd', tags: ['x'], createdAt: stamp })
  assert.equal('description' in updatePack(next, 'p', { name: 'Linux2', description: '' }).packs[0], false)
  assert.equal(updatePack(library(), 'p', { name: 'LINUX' }).packs[0].name, 'LINUX')
  assert.throws(() => updatePack(library(), 'p', { name: ' go ' }), { key: 'packNameDuplicate' })
  assert.throws(() => updatePack(library(), 'p', { name: '' }), { key: 'packNameRequired' })
  assert.throws(() => updatePack(library(), 'p', { name: 'N', description: 'd'.repeat(501) }), { message: 'Invalid packs' })
  assert.throws(() => updatePack(library(), 'zz', { name: 'N' }), { key: 'packDeleted' })
})

test('reorderPackLists reorders only the places that pack holds in lists', () => {
  assert.deepEqual(ids(reorderPackLists(library(), 'p', ['b', 'a'])), ['b', 'g', 'a'])
  assert.throws(() => reorderPackLists(library(), 'zz', []), { key: 'packDeleted' })
})

test('reorderPackLists drops ids the pack does not hold, and keeps repeated ids once', () => {
  assert.deepEqual(ids(reorderPackLists(library(), 'p', ['x', 'b', 'g', 'a'])), ['b', 'g', 'a'])
  assert.deepEqual(ids(reorderPackLists(library(), 'p', ['b', 'b', 'a'])), ['b', 'g', 'a'])
})

test('reorderPackLists puts lists of the pack that were not given after the given ones, in saved order', () => {
  const more = library()
  more.lists.push(list('c', '発展', 'p'))
  assert.deepEqual(ids(reorderPackLists(more, 'p', ['b'])), ['b', 'g', 'a', 'c'])
  assert.deepEqual(ids(reorderPackLists(more, 'p', ['c', 'x'])), ['c', 'g', 'a', 'b'])
  assert.deepEqual(ids(reorderPackLists(more, 'p', [])), ['a', 'g', 'b', 'c'])
})

test('deletePack removes the pack and its lists', () => {
  const next = deletePack(library(), 'p')
  assert.deepEqual([next.packs.map(item => item.id), ids(next)], [['q'], ['g']])
  assert.throws(() => deletePack(library(), 'zz'), { key: 'packDeleted' })
})

test('saveListInPack edits in place, keeping records, createdAt and the pack\'s labels', () => {
  const next = saveListInPack(library(), input('a', 'ls 基本', { words: words('new') }), 'p', true)
  validateLibrary(next)
  assert.deepEqual(ids(next), ['a', 'g', 'b'])
  assert.deepEqual(next.lists[0], { ...library().lists[0], name: 'ls 基本', words: words('new') })
  assert.deepEqual(next.packs[0], library().packs[0])
  assert.throws(() => saveListInPack(library(), input('x', 'X'), 'p', true), { key: 'listDeleted' })
  assert.throws(() => saveListInPack(library(), input('a', 'X'), 'zz', true), { key: 'packDeleted' })
  assert.throws(() => saveListInPack(library(), input('x', '応用'), 'p', false), { key: 'listNameDuplicate' })
  assert.throws(() => saveListInPack(library(), input('x', 'X', { words: [] }), 'p', false), { key: 'wordsRequired' })
})

test('saveListInPack moves a list to another pack and drops the pack left empty', () => {
  const moved = saveListInPack(library(), input('b', '応用'), 'q', true)
  assert.deepEqual(ids(moved), ['a', 'g', 'b'])
  assert.equal(moved.lists[2].packId, 'q')
  assert.throws(() => saveListInPack(library(), input('a', '基本'), 'q', true), { key: 'listNameDuplicate' })
  const home = saveListInPack(library(), input('g', '基本2'), 'p', true)
  assert.deepEqual(home.packs.map(item => item.id), ['p'])
  assert.deepEqual(ids(home), ['a', 'b', 'g'])
  validateLibrary(home)
})

test('saveListInPack puts a moved list right after the last list of the target pack', () => {
  const lib = { packs: library().packs, lists: [list('a', 'A', 'p'), list('g', 'G', 'q'), list('b', 'B', 'p'), list('h', 'H', 'q')] }
  assert.deepEqual(ids(saveListInPack(lib, input('g', 'G'), 'p', true)), ['a', 'b', 'g', 'h'])
  assert.deepEqual(ids(saveListInPack(lib, input('a', 'A'), 'q', true)), ['g', 'b', 'h', 'a'])
})

test('saveListInPack with no pack makes a pack named after the list, and tidies levels', () => {
  const next = saveListInPack(library(), input('n', ' Rust ', { levels: ['', ' 初級 '] }), null, false)
  validateLibrary(next)
  assert.equal(next.packs.at(-1).id, 'pack-n')
  assert.equal(next.packs.at(-1).name, 'Rust')
  assert.deepEqual(next.lists.at(-1).levels, ['初級'])
  assert.equal('levels' in saveListInPack(library(), input('n', 'Rust', { levels: [' '] }), null, false).lists.at(-1), false)
  assert.throws(() => saveListInPack(library(), input('n', 'Rust', { levels: ['x'.repeat(51)] }), null, false), { message: 'Invalid packs' })
  assert.throws(() => saveListInPack(library(), input('n', 'Rust', { levels: ['1', '2'] }), null, false), { key: 'tooManyLevels' })
})

test('duplicateList copies into the same pack and avoids names only within it', () => {
  const lists = [...library().lists, list('x', '基本（コピー）', 'q')]
  const suffix = n => `（コピー${n === 1 ? '' : n}）`
  const { lists: next, copy } = duplicateList(lists, 'a', 'c', suffix)
  assert.equal(copy.packId, 'p')
  assert.equal(copy.name, '基本（コピー）')
  assert.equal(next.at(-1), copy)
  assert.equal(duplicateList(next, 'a', 'd', suffix).copy.name, '基本（コピー2）')
})

test('saveList checks the name only among lists of the same pack', () => {
  const lists = library().lists
  assert.equal(saveList(lists, list('n', 'Go2', 'p'), false).length, 4)
  assert.equal(saveList(lists, list('n', '応用', 'q'), false).length, 4)
  assert.throws(() => saveList(lists, list('n', '応用', 'p'), false), { key: 'listNameDuplicate' })
  assert.throws(() => saveList(lists, list('n', '基本', 'q'), false), { key: 'listNameDuplicate' })
  assert.throws(() => saveList(lists, { ...list('n', '基本'), packId: undefined }, false), { key: 'listNameDuplicate' })
})

test('saveListInPack refuses levels that leave a list of the pack out of reach', () => {
  const lib = { packs: library().packs, lists: [list('a', 'A', 'p', { levels: ['基本'] }), list('b', '応用', 'p'), list('g', 'G', 'q', { levels: ['初級'] })] }
  // Equal levels, compared trimmed.
  assert.throws(() => saveListInPack(lib, input('n', 'N', { levels: [' 基本 '] }), 'p', false), { key: 'levelsConflict' })
  // A list without levels is chosen by its name, which must not be another list's level.
  assert.throws(() => saveListInPack(lib, input('n', '基本'), 'p', false), { key: 'levelsConflict' })
  assert.throws(() => saveListInPack(lib, input('n', 'N', { levels: ['応用'] }), 'p', false), { key: 'levelsConflict' })
  // Moving a list into a pack is checked against that pack; editing a list is not checked against itself.
  assert.throws(() => saveListInPack(lib, input('g', 'G', { levels: ['基本'] }), 'p', true), { key: 'levelsConflict' })
  assert.deepEqual(saveListInPack(lib, input('a', 'A', { levels: ['基本'] }), 'p', true).lists[0].levels, ['基本'])
  // Other levels are fine, as are the same levels in another pack and a list that starts its own pack.
  assert.deepEqual(saveListInPack(lib, input('n', 'N', { levels: ['中級'] }), 'p', false).lists.at(-1).levels, ['中級'])
  assert.equal(saveListInPack(lib, input('n', 'N', { levels: ['初級 '] }), 'p', false).lists.length, 4)
  assert.equal(saveListInPack(lib, input('n', 'N', { levels: ['応用'] }), 'q', false).lists.length, 4)
  assert.equal(saveListInPack(lib, input('n', '応用', { levels: ['基本'] }), null, false).lists.length, 4)
})

test('tidyLevels, saveListInPack and createPack refuse more than one level, as tooManyLevels', () => {
  const { tidyLevels } = require('../src/core/packEditing.ts')
  assert.throws(() => tidyLevels(['基本', '初級']), { key: 'tooManyLevels' })
  assert.throws(() => tidyLevels(['基本', '基本']), { key: 'tooManyLevels' })
  assert.throws(() => tidyLevels(['1', '2', '3', '4', '5', '6']), { key: 'tooManyLevels' })
  // Counted after dropping empty levels.
  assert.deepEqual(tidyLevels([' ', ' 基本 ', '']), { levels: ['基本'] })
  assert.deepEqual(tidyLevels(['', ' ']), {})
  assert.throws(() => tidyLevels(['x'.repeat(51)]), { message: 'Invalid packs' })
  const lib = library()
  const before = JSON.stringify(lib)
  assert.throws(() => saveListInPack(lib, input('n', 'N', { levels: ['基本', '初級'] }), 'p', false), { key: 'tooManyLevels' })
  assert.throws(() => saveListInPack(lib, input('a', '基本', { levels: ['中級1', 'A'] }), 'p', true), { key: 'tooManyLevels' })
  assert.throws(() => saveListInPack(lib, input('n', 'N', { levels: ['基本', '初級'] }), null, false), { key: 'tooManyLevels' })
  assert.throws(() => createPack(lib, { name: 'New' }, list('n', 'N', undefined, { levels: ['基本', '初級'] }), 'n'), { key: 'tooManyLevels' })
  assert.equal(JSON.stringify(lib), before)
})

test('the official library has no lists out of reach in its packs', () => {
  const { officialLibrary: initialLibrary } = require('../src/plugins/packs/index.ts')
  const path = item => item.levels?.length ? item.levels : [item.name]
  for (const pack of initialLibrary.packs) {
    const paths = initialLibrary.lists.filter(item => item.packId === pack.id).map(path)
    paths.forEach((a, i) => paths.forEach((b, j) => {
      if (i !== j && a.length <= b.length) assert.ok(a.some((level, n) => level !== b[n]), `${pack.name}: ${a} / ${b}`)
    }))
  }
})

// Followed official packs: the catalog's to change, so edits are refused (deleting and records still work).
const { followPack } = require('../src/core/followedPacks.ts')
const { copyPack } = require('../src/core/packFile.ts')
const official = {
  catalogId: 'cat', version: 1,
  pack: { id: 'cat', name: '公式', createdAt: stamp },
  lists: [list('o1', '公式1', 'cat'), list('o2', '公式2', 'cat')],
}
const followedLibrary = () => {
  const base = followPack(library(), [official], 'cat', { pack: 'f', lists: ['fl1', 'fl2'] })
  return base
}

test('edits to a followed pack and its lists are refused with packFollowed', () => {
  const lib = followedLibrary()
  const refused = { key: 'packFollowed' }
  assert.throws(() => updatePack(lib, 'f', { name: 'x' }), refused)
  assert.throws(() => reorderPackLists(lib, 'f', ['fl2', 'fl1']), refused)
  assert.throws(() => saveListInPack(lib, input('n', 'new'), 'f', false), refused)
  assert.throws(() => saveListInPack(lib, input('fl1', 'edit'), 'f', true), refused)
  assert.throws(() => duplicateList(lib.lists, 'fl1', 'c', n => `（${n}）`), refused)
})

test('moving a list into or out of a followed pack is refused', () => {
  const lib = followedLibrary()
  const refused = { key: 'packFollowed' }
  assert.throws(() => saveListInPack(lib, input('a', 'a'), 'f', true), refused)
  assert.throws(() => saveListInPack(lib, input('fl1', 'fl1'), 'p', true), refused)
  assert.throws(() => saveListInPack(lib, input('fl1', 'fl1'), null, true), refused)
})

test('own packs still edit beside followed ones; deletePack unfollows', () => {
  const lib = followedLibrary()
  assert.equal(updatePack(lib, 'p', { name: 'Linux2' }).packs.find(item => item.id === 'p').name, 'Linux2')
  assert.equal(deletePack(lib, 'f').packs.some(item => item.id === 'f'), false)
  assert.equal(deletePack(lib, 'f').lists.some(item => item.packId === 'f'), false)
})

test('copyPack of a followed pack is an own pack without origin', () => {
  const lib = followedLibrary()
  assert.ok(lib.lists.some(item => item.origin))
  const copied = copyPack(lib, 'f', { pack: 'c', lists: ['c1', 'c2'] }, n => `（${n}）`)
  const copy = copied.packs.find(item => item.id === 'c')
  assert.equal('origin' in copy, false)
  const lists = copied.lists.filter(item => item.packId === 'c')
  assert.equal(lists.length, 2)
  assert.ok(lists.every(item => !('origin' in item)))
  assert.equal(updatePack(copied, 'c', { name: 'mine' }).packs.find(item => item.id === 'c').name, 'mine')
})

test('saveListInPack sets and removes writing', () => {
  const marked = saveListInPack(library(), input('w', 'Words', { writing: { language: 'en' } }), 'q', false)
  assert.deepEqual(marked.lists.find(item => item.id === 'w').writing, { language: 'en' })
  const edited = saveListInPack(marked, input('w', 'Words'), 'q', true)
  assert.equal('writing' in edited.lists.find(item => item.id === 'w'), false)
  const changed = saveListInPack(marked, input('w', 'Words', { writing: { language: 'ja' } }), 'q', true)
  assert.deepEqual(changed.lists.find(item => item.id === 'w').writing, { language: 'ja' })
  assert.throws(() => saveListInPack(library(), input('w', 'Words', { writing: { language: 'xx' } }), 'q', false), { key: 'invalidWritingLanguage' })
})

test('duplicateList keeps writing', () => {
  const lists = [list('a', 'A', 'p', { writing: { language: 'fr' } })]
  assert.deepEqual(duplicateList(lists, 'a', 'b', n => `（${n}）`).copy.writing, { language: 'fr' })
})
