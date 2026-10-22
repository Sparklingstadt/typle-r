const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// The iPad app (ios/) is built on macOS only (.github/workflows/ios.yml); these checks of its data run everywhere.
const root = path.join(__dirname, '..')
const ios = path.join(root, 'ios')

function swiftFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '.build' ? [] : swiftFiles(file)
    return entry.name.endsWith('.swift') ? [file] : []
  })
}

function readStrings(lang) {
  const text = fs.readFileSync(path.join(ios, 'Typle/Resources', `${lang}.lproj/Localizable.strings`), 'utf8')
  const strings = new Map()
  for (const match of text.matchAll(/^"((?:[^"\\]|\\.)*)" = "((?:[^"\\]|\\.)*)";$/gm)) {
    assert.equal(strings.has(match[1]), false, `${lang}: ${match[1]} twice`)
    strings.set(match[1], JSON.parse(`"${match[2]}"`))
  }
  return strings
}

// `%@`, `%ld` and their positional forms, as [position, type]; `%%` is a literal percent sign.
function placeholders(value) {
  let next = 0
  return [...value.replaceAll('%%', '').matchAll(/%(?:(\d+)\$)?(@|ld|d)/g)]
    .map(([, position, type]) => `${position ?? ++next}:${type}`).sort()
}

function enumCases(sources, name) {
  const match = sources.match(new RegExp(`enum ${name}\\b[^{]*\\{(?:\\s*///[^\\n]*)*\\s*case ([^\\n]+)`))
  assert.ok(match, `enum ${name}`)
  return match[1].split(',').map(item => item.trim())
}

test('the iPad app bundles the same starting lists as the web app', () => {
  for (const name of ['samples.json', 'countries.json', 'commands.json']) {
    assert.equal(fs.readFileSync(path.join(ios, 'TypleCore/Sources/TypleCore/Resources', name), 'utf8'),
      fs.readFileSync(path.join(root, 'src/plugins/packs', name), 'utf8'), `${name}: copy src/plugins/packs/${name} again`)
  }
})

test('the iPad app has Japanese and English text for every key it uses, with the same placeholders', () => {
  const files = [...swiftFiles(path.join(ios, 'Typle')), ...swiftFiles(path.join(ios, 'TypleCore/Sources'))]
  const sources = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  const dynamic = { 'wordLists.order.': 'ListOrder', 'rankings.list.sorts.': 'ListSort', 'settings.languageNames.': 'AppLanguage', 'settings.languages.': 'AppLanguage' }
  const used = new Set()
  for (const [, argument] of sources.matchAll(/\bL\(((?:"(?:[^"\\]|\\.)*"|[^,()"])*)/g)) {
    for (const [, key] of argument.matchAll(/"([^"]*)"/g)) {
      const at = key.indexOf('\\(')
      if (at < 0) { used.add(key); continue }
      const prefix = key.slice(0, at)
      assert.ok(dynamic[prefix], `unknown dynamic key ${key}`)
      for (const value of enumCases(sources, dynamic[prefix])) used.add(prefix + value)
    }
  }
  for (const [, key] of sources.matchAll(/TypleError\("(\w+)"/g)) used.add(`errors.${key}`)
  assert.ok(used.size > 100)

  const ja = readStrings('ja')
  const en = readStrings('en')
  for (const key of used) {
    assert.ok(ja.has(key), `ja: missing ${key}`)
    assert.ok(en.has(key), `en: missing ${key}`)
  }
  assert.deepEqual([...en.keys()].sort(), [...ja.keys()].sort())
  for (const [key, value] of ja) assert.deepEqual(placeholders(en.get(key)), placeholders(value), key)
})
