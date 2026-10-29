require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { initialLists } = require('../src/plugins/packs/index.ts')
const languageLists = initialLists.filter(list => list.id.endsWith('-basics'))
const { decodeLists } = require('../src/core/wordLists.ts')
const { officialPacks, followOfficialPack } = require('../src/plugins/packs/catalog.ts')
const { validateLibrary } = require('../src/core/wordPacks.ts')

test('the six beginner language lists decode and can be followed with all their words intact', () => {
  assert.deepEqual(languageLists.map(list => list.id), ['korean-basics', 'french-basics', 'czech-basics', 'german-basics', 'spanish-basics', 'chinese-basics'])
  assert.deepEqual(decodeLists(JSON.stringify({ version: 1, lists: languageLists })), languageLists)
  assert.equal(new Set(initialLists.map(list => list.id)).size, initialLists.length)
  let library = { packs: [], lists: [] }
  for (const list of languageLists) {
    assert.equal(list.words.length, 80)
    assert.ok(list.words.every(word => word.input_type === 'word'))
    assert.equal(list.category, '語学')
    assert.deepEqual(list.records, [])
    assert.ok(list.words.every(word => word.annotation.startsWith(`${word.input} / `)))
    const entry = officialPacks().find(pack => pack.lists.some(item => item.id === list.id))
    assert.ok(entry, list.id)
    library = followOfficialPack(library, entry.catalogId, { pack: `followed-${list.id}`, lists: [`mine-${list.id}`] })
    const followed = library.lists.find(item => item.origin?.listId === list.id)
    assert.deepEqual(followed.words, list.words)
  }
  validateLibrary(library)
  assert.equal(library.packs.length, 6)
  assert.equal(library.lists.reduce((count, list) => count + list.words.length, 0), 480)
})

test('native spelling, romanization and tone marks remain in the typing targets', () => {
  const word = (id, display) => languageLists.find(list => list.id === id).words.find(item => item.display === display)
  assert.equal(word('korean-basics', '저는 학생이에요.').input, 'jeoneun haksaengieyo.')
  assert.equal(word('french-basics', 'être').input, 'être')
  assert.equal(word('czech-basics', 'děkuji').input, 'děkuji')
  assert.equal(word('german-basics', 'groß').input, 'groß')
  assert.equal(word('spanish-basics', '¿Qué es esto?').input, '¿Qué es esto?')
  assert.equal(word('chinese-basics', '你好').input, 'nǐ hǎo')
})

test('English and Russian each have one pack of basic and intermediate words and syntax', () => {
  const { officialLibrary } = require('../src/plugins/packs/index.ts')
  for (const [slug, language] of [['english', '英語'], ['russian', 'ロシア語']]) {
    const pack = officialLibrary.packs.find(item => item.name === `${language}：基礎・中級`)
    assert.ok(pack, language)
    assert.equal(pack.category, '語学')
    assert.deepEqual(pack.tags, [language])
    const lists = officialLibrary.lists.filter(list => list.packId === pack.id)
    assert.deepEqual(lists.map(list => list.id), ['basic-words', 'basic-syntax', 'intermediate-words', 'intermediate-syntax'].map(level => `${slug}-${level}`))
    assert.deepEqual(lists.map(list => list.levels), [['基礎単語'], ['基礎構文'], ['中級単語'], ['中級構文']])
    for (const list of lists) {
      assert.equal(list.words.length, 40, list.id)
      assert.equal(new Set(list.words.map(word => word.input)).size, 40, list.id)
      assert.ok(list.words.every(word => word.input_type === 'word' && word.display === word.input && word.annotation.startsWith(`${word.input} / `)), list.id)
    }
  }
  // Russian is typed in Cyrillic, as written.
  const russian = officialLibrary.lists.find(list => list.id === 'russian-basic-syntax')
  assert.ok(russian.words.every(word => !/[a-z]/i.test(word.input)))
  assert.ok(russian.words.some(word => word.input === 'Меня зовут Кен.'))
})

test('Czech intermediate and Chinese HSK 5 and 6 packs each hold two lists of 40 words', () => {
  const { officialLibrary } = require('../src/plugins/packs/index.ts')
  for (const [name, tag, ids, levels] of [
    ['チェコ語：中級', 'チェコ語', ['czech-intermediate-words', 'czech-intermediate-syntax'], ['中級単語', '中級構文']],
    ['中国語：HSK5級レベル単語', '中国語', ['chinese-hsk5-words-1', 'chinese-hsk5-words-2'], ['単語1', '単語2']],
    ['中国語：HSK6級レベル単語', '中国語', ['chinese-hsk6-words-1', 'chinese-hsk6-words-2'], ['単語1', '単語2']],
  ]) {
    const pack = officialLibrary.packs.find(item => item.name === name)
    assert.ok(pack, name)
    assert.equal(pack.category, '語学')
    assert.deepEqual(pack.tags, [tag])
    const lists = officialLibrary.lists.filter(list => list.packId === pack.id)
    assert.deepEqual(lists.map(list => list.id), ids)
    assert.deepEqual(lists.map(list => list.levels), levels.map(level => [level]))
    for (const list of lists) {
      assert.equal(list.words.length, 40, list.id)
      assert.equal(new Set(list.words.map(word => word.input)).size, 40, list.id)
      assert.ok(list.words.every(word => word.input_type === 'word' && word.annotation.startsWith(`${word.input} / `)), list.id)
    }
  }
  // Chinese words show the characters and are typed in pinyin with tone marks; no word is in both HSK packs.
  const hsk = officialLibrary.lists.filter(list => list.id.startsWith('chinese-hsk'))
  const words = hsk.flatMap(list => list.words)
  assert.equal(new Set(words.map(word => word.display)).size, 160)
  assert.ok(words.every(word => /^\p{Script=Han}+$/u.test(word.display) && /^[\p{Script=Latin} ]+$/u.test(word.input)))
  assert.equal(words.find(word => word.display === '规律').input, 'guīlǜ')
  assert.equal(officialLibrary.lists.find(list => list.id === 'czech-intermediate-words').words[0].input, 'zkušenost')
})
