const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// The Android app (android/) is built on GitHub Actions only (.github/workflows/android.yml); these checks of its
// data run everywhere.
const root = path.join(__dirname, '..')
const android = path.join(root, 'android')

function kotlinFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return ['build', '.gradle'].includes(entry.name) ? [] : kotlinFiles(file)
    return entry.name.endsWith('.kt') ? [file] : []
  })
}

function readMessages(lang) {
  return JSON.parse(fs.readFileSync(path.join(android, 'app/src/main/assets/messages', `${lang}.json`), 'utf8'))
}

// Java's `%s`, `%d` and their positional forms, as [position, type]; `%%` is a literal percent sign.
function placeholders(value) {
  let next = 0
  return [...value.replaceAll('%%', '').matchAll(/%(?:(\d+)\$)?([sd])/g)]
    .map(([, position, type]) => `${position ?? ++next}:${type}`).sort()
}

// The text with the most placeholders: a plural's `other` form.
function full(value) {
  return typeof value === 'string' ? value : value.other
}

function enumCases(sources, name) {
  const match = sources.match(new RegExp(`enum class ${name}\\b[^{]*\\{([^;}]*)`))
  assert.ok(match, `enum class ${name}`)
  return match[1].split(',').map(item => item.trim().match(/^\w+/)?.[0]).filter(Boolean).map(item => item.toLowerCase())
}

test('the Android app bundles the same starting lists as the web app', () => {
  for (const name of ['samples.json', 'countries.json', 'commands.json']) {
    assert.equal(fs.readFileSync(path.join(android, 'core/src/main/resources', name), 'utf8'),
      fs.readFileSync(path.join(root, 'src/plugins/packs', name), 'utf8'), `${name}: copy src/plugins/packs/${name} again`)
  }
})

test('the Android app has Japanese and English text for every key it uses, with the same placeholders', () => {
  const files = [...kotlinFiles(path.join(android, 'app/src')), ...kotlinFiles(path.join(android, 'core/src/main'))]
  const sources = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  const dynamic = { 'wordLists.order.': 'ListOrder', 'rankings.list.sorts.': 'ListSort', 'settings.languageNames.': 'AppLanguage', 'settings.languages.': 'AppLanguage' }
  const used = new Set()
  for (const [, key] of sources.matchAll(/\bL\("((?:[^"\\]|\\.)*)"/g)) {
    const at = key.indexOf('$')
    if (at < 0) { used.add(key); continue }
    const prefix = key.slice(0, at)
    assert.ok(dynamic[prefix], `unknown dynamic key ${key}`)
    for (const value of enumCases(sources, dynamic[prefix])) used.add(prefix + value)
  }
  for (const [, key] of sources.matchAll(/TypleException\("(\w+)"/g)) used.add(`errors.${key}`)

  const ja = readMessages('ja')
  const en = readMessages('en')
  for (const key of used) {
    assert.ok(key in ja, `ja: missing ${key}`)
    assert.ok(key in en, `en: missing ${key}`)
  }
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort())
  for (const [key, value] of Object.entries(ja)) {
    assert.deepEqual(placeholders(full(en[key])), placeholders(full(value)), key)
    for (const text of typeof en[key] === 'string' ? [] : [en[key].one, en[key].other]) {
      assert.equal(typeof text, 'string', `${key}: a plural needs one and other`)
    }
  }
})

test('the Android app speaks of this tablet, not of an iPad or a browser', () => {
  for (const lang of ['ja', 'en']) {
    const text = JSON.stringify(readMessages(lang))
    for (const word of ['iPad', 'ブラウザー', 'browser', 'Keychain']) assert.ok(!text.includes(word), `${lang}: ${word}`)
  }
})
