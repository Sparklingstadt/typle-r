const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// The Windows app (windows/) is built and run on Windows only (the CI workflow for it was removed in v0.70.0); these
// checks of its text run everywhere.
const root = path.join(__dirname, '..')
const windows = path.join(root, 'windows')

function csharpFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return ['bin', 'obj'].includes(entry.name) ? [] : csharpFiles(file)
    return entry.name.endsWith('.cs') ? [file] : []
  })
}

function readMessages(lang) {
  return JSON.parse(fs.readFileSync(path.join(windows, 'Typle/Messages', `${lang}.json`), 'utf8'))
}

// .NET's `{0}` arguments, and the `{name}` placeholders of error messages.
function placeholders(value) {
  return [...value.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort()
}

// The text with the most placeholders: a plural's `other` form.
function full(value) {
  return typeof value === 'string' ? value : value.other
}

function enumCases(sources, name) {
  const match = sources.match(new RegExp(`enum ${name}\\b[^{]*\\{([^}]*)\\}`))
  assert.ok(match, `enum ${name}`)
  return match[1].split(',').map(item => item.replace(/\/\/\/.*$/gm, '').trim().match(/\w+$/)?.[0]).filter(Boolean)
    .map(item => item.toLowerCase())
}

test('the Windows app has Japanese and English text for every key it uses, with the same placeholders', () => {
  const sources = [...csharpFiles(path.join(windows, 'Typle')), ...csharpFiles(path.join(windows, 'Typle.Core'))]
    .map(file => fs.readFileSync(file, 'utf8')).join('\n')
  // Keys made from a prefix and an enum's case or a language tag.
  const dynamic = {
    'wordLists.order.': enumCases(sources, 'ListOrder'),
    'rankings.list.sorts.': enumCases(sources, 'ListSort'),
    'settings.languageNames.': ['ja', 'en'],
    'settings.languages.': ['ja', 'en'],
  }
  const used = new Set()
  for (const [, key] of sources.matchAll(/\bL\("([^"]+)"/g)) {
    if (!key.endsWith('.')) { used.add(key); continue }
    assert.ok(dynamic[key], `unknown dynamic key ${key}`)
    for (const value of dynamic[key]) used.add(key + value)
  }
  for (const [, key] of sources.matchAll(/TypleException(?:\.With)?\("(\w+)"/g)) used.add(`errors.${key}`)
  // The backend's error keys the app passes on as they are (Accounts.Error).
  for (const key of ['conflict', 'workspaceTooLarge', 'databaseUnavailable', 'invalidWorkspace', 'workspaceSaveFailed', 'forbiddenRequest', 'emptyRequest']) {
    used.add(`errors.${key}`)
  }

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
    // string.Format reads every brace: outside the errors (filled by name), only {0}, {1}… may appear.
    if (!key.startsWith('errors.')) {
      for (const text of [value, en[key]].flatMap(item => typeof item === 'string' ? [item] : [item.one, item.other])) {
        assert.ok(!/[{}]/.test(text.replace(/\{\d+\}/g, '')), `${key}: a brace that is not an argument`)
      }
    }
  }
})

test('the Windows app speaks of this PC, not of a tablet, an iPad or Android', () => {
  for (const lang of ['ja', 'en']) {
    const text = JSON.stringify(readMessages(lang))
    for (const word of ['タブレット', 'tablet', 'Tablet', 'iPad', 'Android', 'Keystore', 'Keychain', 'Chrome']) {
      assert.ok(!text.includes(word), `${lang}: ${word}`)
    }
  }
})

test('the Windows app logs in as the windows client of the web app', () => {
  const client = fs.readFileSync(path.join(windows, 'Typle.Core/AccountClient.cs'), 'utf8')
  assert.match(client, /new\("client", "windows"\)/)
  const auth = fs.readFileSync(path.join(root, 'server/internal/web/auth.go'), 'utf8')
  assert.match(auth, /"windows": true/)
})
