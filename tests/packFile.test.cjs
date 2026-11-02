require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { validateLibrary } = require('../src/core/wordPacks.ts')
const { packFileOf, encodePackFile, decodePackFile, importPackFile, copyPack } = require('../src/core/packFile.ts')
const { MAX_LISTS } = require('../src/core/listOverview.ts')

const dir = path.join(__dirname, 'fixtures/pack-file')
const fixtures = fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => [name, JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))])
const stamp = '2026-10-01T00:00:00.000Z'
const now = new Date('2026-10-26T00:00:00Z')
const words = (...texts) => texts.map(text => ({ display: text, input: text.toLowerCase(), annotation: '' }))
const file = (lists, pack = { name: 'Imported' }) => ({ format: 'typle-pack', version: 1, pack, lists })
const library = () => ({
  packs: [
    { id: 'p', name: 'Linux', description: 'D', category: 'C', tags: ['t'], origin: { catalogId: 'p', version: 1 }, createdAt: stamp },
    { id: 'q', name: 'Go', createdAt: stamp },
  ],
  lists: [
    { id: 'a', name: '基本', packId: 'p', levels: ['基本'], words: words('ls'), records: [{ time: 5, date: '2026-10-05T00:00:00.000Z' }], createdAt: stamp },
    { id: 'g', name: 'Go', packId: 'q', words: words('go'), records: [], createdAt: stamp },
    { id: 'b', name: '応用', packId: 'p', levels: ['応用'], words: words('grep'), records: [], createdAt: stamp },
  ],
})
const full = extra => {
  const lib = { packs: [], lists: [] }
  for (let i = 0; i < MAX_LISTS - extra; i++) {
    lib.packs.push({ id: `p${i}`, name: `P${i}`, createdAt: stamp })
    lib.lists.push({ id: `l${i}`, name: `l${i}`, packId: `p${i}`, words: words('x'), records: [], createdAt: stamp })
  }
  return lib
}

for (const [name, fixture] of fixtures) {
  test(`${name}: encodePackFile writes the fixture's file`, () => {
    assert.equal(encodePackFile(fixture.library, fixture.packId), fixture.file)
  })

  test(`${name}: an encoded file read back and imported encodes to the same file, under a numbered name`, () => {
    const decoded = decodePackFile(fixture.file)
    const ids = { pack: 'imported', lists: decoded.lists.map((_, n) => `i${n}`) }
    const next = importPackFile(fixture.library, decoded, ids, now)
    validateLibrary(next)
    const pack = next.packs.at(-1)
    assert.equal(pack.id, 'imported')
    assert.equal(pack.name, `${decoded.pack.name}（2）`)
    assert.equal(pack.createdAt, now.toISOString())
    assert.equal(pack.origin, undefined)
    const lists = next.lists.filter(list => list.packId === 'imported')
    assert.deepEqual(lists.map(list => [list.id, list.records, list.createdAt]), ids.lists.map(id => [id, [], now.toISOString()]))
    const expected = JSON.parse(fixture.file)
    expected.pack.name = pack.name
    assert.equal(encodePackFile(next, 'imported'), JSON.stringify(expected, null, 2) + '\n')
    assert.deepEqual(next.packs.slice(0, -1), fixture.library.packs)
    assert.deepEqual(next.lists.slice(0, -lists.length), fixture.library.lists)
  })
}

test('encodePackFile leaves out empty optional fields and refuses a pack that is gone', () => {
  const lib = library()
  lib.packs[1] = { ...lib.packs[1], description: '', category: '', tags: [] }
  lib.lists[1] = { ...lib.lists[1], levels: [] }
  assert.equal(encodePackFile(lib, 'q'), JSON.stringify(file([{ name: 'Go', words: words('go') }], { name: 'Go' }), null, 2) + '\n')
  assert.throws(() => encodePackFile(lib, 'missing'), { key: 'packDeleted' })
})

test('decodePackFile keeps the known fields only and treats null as left out', () => {
  const text = JSON.stringify({ ...file([{ name: 'L', levels: null, extra: 1, words: [{ display: 'A', input: 'a', annotation: 'n', more: 2 }] }],
    { name: 'P', description: null, category: 'c', tags: ['t'], id: 'x' }), id: 'y' })
  assert.deepEqual(decodePackFile(text), file([{ name: 'L', words: [{ display: 'A', input: 'a', annotation: 'n' }] }], { name: 'P', category: 'c', tags: ['t'] }))
})

test('decodePackFile refuses what is not a pack file', () => {
  const good = file([{ name: 'L', words: words('a') }])
  const bad = [
    'not json', 'null', '[]', '"text"',
    JSON.stringify({ ...good, format: 'typle-list' }),
    JSON.stringify({ ...good, format: undefined }),
    JSON.stringify({ ...good, version: 2 }),
    JSON.stringify({ ...good, version: '1' }),
    JSON.stringify({ ...good, pack: null }),
    JSON.stringify({ ...good, pack: { name: 1 } }),
    JSON.stringify({ ...good, pack: { name: 'P', tags: 't' } }),
    JSON.stringify({ ...good, pack: { name: 'P', tags: [1] } }),
    JSON.stringify({ ...good, pack: { name: 'P', description: 1 } }),
    JSON.stringify({ ...good, lists: {} }),
    JSON.stringify({ ...good, lists: [] }),
    JSON.stringify({ ...good, lists: [null] }),
    JSON.stringify({ ...good, lists: [{ name: 'L' }] }),
    JSON.stringify({ ...good, lists: [{ name: 'L', levels: 'x', words: words('a') }] }),
    JSON.stringify({ ...good, lists: [{ name: 'L', words: [{ display: 1, input: 'a', annotation: '' }] }] }),
    JSON.stringify({ ...good, lists: [{ name: 'L', words: [{ display: 'a', input: 'a' }] }] }),
  ]
  for (const text of bad) assert.throws(() => decodePackFile(text), { key: 'packFileUnreadable' }, text)
})

test('importPackFile adds the pack and its lists at the end, tidied as a save would', () => {
  const next = importPackFile(library(), file([{ name: ' One ', levels: [' 初級 ', ' '], words: [{ display: ' A ', input: 'a', annotation: '' }] }, { name: 'Two', levels: ['中級'], words: words('B') }],
    { name: ' New ', description: ' ', category: ' c ', tags: ['t', 'T', ' '] }), { pack: 'n', lists: ['n1', 'n2'] }, now)
  assert.deepEqual(next.packs.at(-1), { id: 'n', name: 'New', category: 'c', tags: ['t'], createdAt: now.toISOString() })
  assert.deepEqual(next.lists.slice(-2), [
    { id: 'n1', name: 'One', levels: ['初級'], packId: 'n', words: [{ display: ' A ', input: 'a', annotation: '' }], records: [], createdAt: now.toISOString() },
    { id: 'n2', name: 'Two', levels: ['中級'], packId: 'n', words: words('B'), records: [], createdAt: now.toISOString() },
  ])
  assert.equal(importPackFile(library(), file([{ name: 'L', words: words('a') }], { name: ' linux ' }), { pack: 'n', lists: ['n1'] }, now).packs.at(-1).name, 'linux（2）')
})

// A file written before v0.97.0 (or a share made then) may give a list several levels, or overlap levels of its lists;
// the import repairs them as reading saved data does, since the one who imports cannot change the file.
test('importPackFile joins several levels of a list and tells apart overlapping levels, as reading saved data does', () => {
  const next = importPackFile(library(), file([
    { name: 'A', levels: ['基本', ' 基本 '], words: words('a') },
    { name: 'B', levels: ['基本', '', '初級'], words: words('b') },
    { name: 'C', words: words('c') },
    { name: 'D', levels: ['C'], words: words('d') },
    { name: 'E', levels: [' 基本・初級 '], words: words('e') },
  ]), { pack: 'n', lists: ['n1', 'n2', 'n3', 'n4', 'n5'] }, now)
  assert.deepEqual(next.lists.slice(-5).map(item => item.levels), [['基本・基本'], ['基本・初級'], undefined, ['C（2）'], ['基本・初級（2）']])
  validateLibrary(next)
})

test('importPackFile refuses a file against the rules of a save, and changes nothing', () => {
  const lib = library()
  const before = JSON.stringify(lib)
  const run = (lists, pack) => importPackFile(lib, file(lists, pack), { pack: 'n', lists: lists.map((_, n) => `n${n}`) }, now)
  assert.throws(() => run([{ name: 'L', words: words('a') }, { name: ' l ', words: words('b') }]), { key: 'listNameDuplicate' })
  assert.throws(() => run([{ name: ' ', words: words('a') }]), { key: 'listNameRequired' })
  assert.throws(() => run([{ name: 'L', words: [] }]), { key: 'wordsRequired' })
  assert.throws(() => run([{ name: 'L', words: [{ display: 'a', input: ' ', annotation: '' }] }]), { key: 'wordFieldsRequired' })
  assert.throws(() => run([{ name: 'L', words: words('a') }], { name: ' ' }), { key: 'packNameRequired' })
  assert.throws(() => run([]), { key: 'packFileUnreadable' })
  assert.throws(() => run([{ name: 'L', words: words('a') }], { name: 'x'.repeat(201) }), { key: 'invalidPackFile' })
  assert.throws(() => run([{ name: 'L', levels: ['1', '2', '3', '4', '5', '6'], words: words('a') }]), { key: 'invalidPackFile' })
  assert.equal(JSON.stringify(lib), before)
  const two = [{ name: 'A', words: words('a') }, { name: 'B', words: words('b') }]
  assert.throws(() => importPackFile(full(1), file(two), { pack: 'n', lists: ['n1', 'n2'] }, now), { key: 'listLimit', values: { max: MAX_LISTS } })
  assert.equal(importPackFile(full(2), file(two), { pack: 'n', lists: ['n1', 'n2'] }, now).lists.length, MAX_LISTS)
})

const suffix = n => n === 1 ? '（コピー）' : `（コピー${n}）`

test('copyPack puts a copy right after the source, without records or origin', () => {
  const next = copyPack(library(), 'p', { pack: 'c', lists: ['c1', 'c2'] }, suffix, now)
  validateLibrary(next)
  assert.deepEqual(next.packs.map(pack => pack.id), ['p', 'c', 'q'])
  assert.deepEqual(next.packs[1], { id: 'c', name: 'Linux（コピー）', description: 'D', category: 'C', tags: ['t'], createdAt: now.toISOString() })
  assert.deepEqual(next.lists.slice(-2), [
    { id: 'c1', name: '基本', levels: ['基本'], packId: 'c', words: words('ls'), records: [], createdAt: now.toISOString() },
    { id: 'c2', name: '応用', levels: ['応用'], packId: 'c', words: words('grep'), records: [], createdAt: now.toISOString() },
  ])
  assert.deepEqual(next.lists.slice(0, 3), library().lists)
  const again = copyPack(next, 'p', { pack: 'd', lists: ['d1', 'd2'] }, suffix, now)
  assert.deepEqual(again.packs.map(pack => [pack.id, pack.name]), [['p', 'Linux'], ['d', 'Linux（コピー2）'], ['c', 'Linux（コピー）'], ['q', 'Go']])
  assert.equal(copyPack(library(), 'p', { pack: 'c', lists: ['c1', 'c2'] }, suffix).lists.at(-1).records.length, 0)
  assert.throws(() => copyPack(library(), 'missing', { pack: 'c', lists: [] }, suffix, now), { key: 'packDeleted' })
  const lib = full(1)
  assert.throws(() => copyPack({ ...lib, lists: [...lib.lists.slice(1), { ...lib.lists[0], packId: 'p1' }] }, 'p1', { pack: 'c', lists: ['c1', 'c2'] }, suffix, now),
    { key: 'listLimit', values: { max: MAX_LISTS } })
})

test('a long name keeps the copy and number marks within 200 characters', () => {
  const long = 'x'.repeat(200)
  const lib = { packs: [{ id: 'p', name: long, createdAt: stamp }], lists: [{ id: 'a', name: 'A', packId: 'p', words: words('a'), records: [], createdAt: stamp }] }
  assert.equal(copyPack(lib, 'p', { pack: 'c', lists: ['c1'] }, suffix, now).packs[1].name, 'x'.repeat(195) + '（コピー）')
  assert.equal(importPackFile(lib, file([{ name: 'A', words: words('a') }], { name: long }), { pack: 'n', lists: ['n1'] }, now).packs[1].name, 'x'.repeat(197) + '（2）')
})

// Limits a save enforces are refused on the file itself, with one key, before anything is saved.
{
  const w = (n = 1) => Array.from({ length: n }, () => ({ display: 'a', input: 'a', annotation: '' }))
  const one = (over = {}) => ({ name: 'L', words: w(), ...over })
  const cases = [
    ['a pack name over 200', file([one()], { name: 'x'.repeat(201) })],
    ['a description over 500', file([one()], { name: 'P', description: 'x'.repeat(501) })],
    ['a category over 50', file([one()], { name: 'P', category: 'x'.repeat(51) })],
    ['more than 20 tags', file([one()], { name: 'P', tags: Array.from({ length: 21 }, (_, n) => `t${n}`) })],
    ['a tag over 50', file([one()], { name: 'P', tags: ['x'.repeat(51)] })],
    ['a list name over 200', file([one({ name: 'x'.repeat(201) })])],
    ['more than 1000 words', file([one({ words: w(1001) })])],
    ['an input over 1000', file([one({ words: [{ display: 'a', input: 'x'.repeat(1001), annotation: '' }] })])],
    ['a display over 1000', file([one({ words: [{ display: 'x'.repeat(1001), input: 'a', annotation: '' }] })])],
    ['an annotation over 2000', file([one({ words: [{ display: 'a', input: 'a', annotation: 'x'.repeat(2001) }] })])],
    ['more than 5 levels, more than an older app saved', file([one({ levels: ['1', '2', '3', '4', '5', '6'] })])],
    ['a level over 50', file([one({ levels: ['x'.repeat(51)] })])],
  ]
  for (const [name, bad] of cases) {
    test(`importPackFile refuses ${name} as invalidPackFile`, () => {
      const lib = library()
      assert.throws(() => importPackFile(lib, bad, { pack: 'n', lists: bad.lists.map((_, n) => `n${n}`) }, now), { key: 'invalidPackFile' })
    })
  }

  test('importPackFile accepts the limits themselves', () => {
    const ok = file([one({ name: 'x'.repeat(200), words: [...w(999), { display: 'x'.repeat(1000), input: 'x'.repeat(1000), annotation: 'x'.repeat(2000) }], levels: ['x'.repeat(50), '2', '3', '4', '5'] })],
      { name: 'x'.repeat(200), description: 'x'.repeat(500), category: 'x'.repeat(50), tags: Array.from({ length: 20 }, (_, n) => `t${n}`) })
    validateLibrary(importPackFile(library(), ok, { pack: 'n', lists: ['n0'] }, now))
  })
}

test('pack files, importing and copies preserve per-word input types and missing legacy values', () => {
  const lib = library()
  const typed = ['command', 'code', 'word'].map(input_type => ({ ...words('A')[0], input_type }))
  typed.push(words('B')[0])
  lib.lists[0].words = typed
  const encoded = encodePackFile(lib, 'p')
  const decoded = decodePackFile(encoded)
  assert.deepEqual(decoded.lists[0].words, typed)
  const imported = importPackFile(lib, decoded, { pack: 'new', lists: ['new-a', 'new-b'] }, now)
  assert.deepEqual(imported.lists.find(list => list.id === 'new-a').words, typed)
  const copied = copyPack(lib, 'p', { pack: 'copy', lists: ['copy-a', 'copy-b'] }, n => `copy${n}`, now)
  assert.deepEqual(copied.lists.find(list => list.id === 'copy-a').words, typed)
  assert.equal('input_type' in decodePackFile(encodePackFile(lib, 'q')).lists[0].words[0], false)
})

test('pack files reject unknown or non-string word input types', () => {
  for (const input_type of ['', 'script', null, 0, false, {}, []]) {
    const invalid = file([{ name: 'L', words: [{ ...words('A')[0], input_type }] }])
    assert.throws(() => decodePackFile(JSON.stringify(invalid)), { key: 'packFileUnreadable' })
    assert.throws(() => importPackFile(library(), invalid, { pack: 'new', lists: ['new-a'] }, now), { key: 'savedDataCorrupted' })
  }
})

test('pack file carries writing', () => {
  const lib = library()
  lib.lists[0].writing = { language: 'ko' }
  const written = packFileOf(lib, 'p')
  assert.deepEqual(written.lists.map(item => item.writing), [{ language: 'ko' }, undefined])
  assert.equal('writing' in written.lists[1], false)
  const decoded = decodePackFile(JSON.stringify(written))
  assert.deepEqual(decoded.lists[0].writing, { language: 'ko' })
  assert.equal('writing' in decoded.lists[1], false)
  const next = importPackFile(lib, decoded, { pack: 'i', lists: ['i1', 'i2'] }, now)
  assert.deepEqual(next.lists.find(item => item.id === 'i1').writing, { language: 'ko' })
  assert.equal('writing' in next.lists.find(item => item.id === 'i2'), false)
  assert.deepEqual(copyPack(lib, 'p', { pack: 'c', lists: ['c1', 'c2'] }, suffix, now).lists.find(item => item.id === 'c1').writing, { language: 'ko' })
  for (const writing of [{ language: 'xx' }, { language: 'ja', extra: 1 }, 'ja']) {
    assert.throws(() => decodePackFile(JSON.stringify(file([{ name: 'A', writing, words: words('a') }]))), { key: 'packFileUnreadable' })
  }
})
