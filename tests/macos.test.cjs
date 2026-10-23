const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// The Mac app (macos/) is built from the iPad app's sources on macOS only (no CI workflow since v0.70.0); these checks
// of its text run everywhere. Its Mac.strings replaces the iPad's text where that names the iPad.
const root = path.join(__dirname, '..')
const ios = path.join(root, 'ios')
const macos = path.join(root, 'macos')

function swiftFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'build' ? [] : swiftFiles(file)
    return entry.name.endsWith('.swift') ? [file] : []
  })
}

function readStrings(file) {
  const text = fs.readFileSync(file, 'utf8')
  const strings = new Map()
  for (const match of text.matchAll(/^"((?:[^"\\]|\\.)*)" = "((?:[^"\\]|\\.)*)";$/gm)) {
    assert.equal(strings.has(match[1]), false, `${file}: ${match[1]} twice`)
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

const languages = ['ja', 'en']
const ipad = Object.fromEntries(languages.map(lang => [lang, readStrings(path.join(ios, 'Typle/Resources', `${lang}.lproj/Localizable.strings`))]))
const mac = Object.fromEntries(languages.map(lang => [lang, readStrings(path.join(macos, 'Typle/Resources', `${lang}.lproj/Mac.strings`))]))
// Words for the iPad and its touch screen, which the Mac has not.
const iPadWords = /iPad|タップ|\bTap\b/

test('the Mac app has its own text wherever the iPad text names the iPad', () => {
  for (const lang of languages) {
    for (const [key, value] of ipad[lang]) {
      if (iPadWords.test(value)) assert.ok(mac[lang].has(key), `${lang}: Mac.strings needs ${key} (${value})`)
    }
    for (const [key, value] of mac[lang]) {
      assert.doesNotMatch(value, iPadWords, `${lang}: ${key}`)
      if (ipad[lang].has(key)) assert.deepEqual(placeholders(value), placeholders(ipad[lang].get(key)), `${lang}: ${key}`)
    }
  }
  assert.deepEqual([...mac.en.keys()].sort(), [...mac.ja.keys()].sort())
  for (const [key, value] of mac.ja) assert.deepEqual(placeholders(mac.en.get(key)), placeholders(value), key)
})

test('the Mac app has Japanese and English text for every key its own sources use', () => {
  const sources = swiftFiles(path.join(macos, 'Typle')).map(file => fs.readFileSync(file, 'utf8')).join('\n')
  const used = new Set([...sources.matchAll(/\bL\("([^"\\]*)"/g)].map(([, key]) => key))
  assert.ok(used.size > 5)
  for (const lang of languages) {
    for (const key of used) assert.ok(mac[lang].has(key) || ipad[lang].has(key), `${lang}: missing ${key}`)
  }
})

test('the Mac app builds the shared sources it needs and leaves out the iPad text field', () => {
  const project = fs.readFileSync(path.join(macos, 'project.yml'), 'utf8')
  assert.match(project, /path: \.\.\/ios\/Typle\n/)
  assert.match(project, /path: \.\.\/ios\/TypleCore\n/)
  assert.match(project, /- Practice\/PracticeTextField\.swift\n/)
  // The Mac's text field stands in for the iPad's, with the same name and the same parameters.
  const members = file => {
    const text = fs.readFileSync(file, 'utf8')
    const struct = text.slice(text.indexOf('struct PracticeTextField'), text.indexOf('func makeCoordinator'))
    return [...struct.matchAll(/^  var (\w+): ([^\n]+)$/gm)].map(([, name, type]) => `${name}: ${type}`)
  }
  assert.deepEqual(members(path.join(macos, 'Typle/Practice/PracticeTextField.swift')),
    members(path.join(ios, 'Typle/Practice/PracticeTextField.swift')))
})
