const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/pageMetadata.ts'), 'utf8')
const block = name => source.slice(source.indexOf(`export const ${name}`), source.indexOf('}', source.indexOf(`export const ${name}`)))
const keysIn = text => Object.fromEntries([...text.matchAll(/^\s+(\w+): "([\w.]+)",$/gm)].map(match => [match[1], match[2]]))
const titleKeys = keysIn(block('PAGE_TITLES'))
const descriptionKeys = keysIn(block('PAGE_DESCRIPTIONS'))
const locales = ['ja', 'en', 'zh-CN', 'zh-TW', 'ru', 'fr']

// "nav.links.home" → the value in src/messages/<locale>/nav.json at links.home
const message = (locale, key) => {
  const [namespace, ...rest] = key.split('.')
  const file = path.join(root, 'src/messages', locale, `${namespace}.json`)
  return rest.reduce((value, part) => value?.[part], JSON.parse(fs.readFileSync(file, 'utf8')))
}

// Every layout.tsx under src/app that sets its metadata with pageMetadata, by route.
function layouts() {
  const found = {}
  const walk = (dir, route) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(file, route + (/^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`)); continue }
      if (entry.name !== 'layout.tsx') continue
      const call = fs.readFileSync(file, 'utf8').match(/pageMetadata\("(\w+)"(?:, (\{[^}]*\}))?\)/)
      if (call) found[route] = { page: call[1], options: call[2] ?? '' }
    }
  }
  walk(path.join(root, 'src/app'), '')
  return found
}

test('every page title key exists in every language', () => {
  assert.ok(Object.keys(titleKeys).length >= 10)
  for (const locale of locales) {
    for (const [page, key] of Object.entries(titleKeys)) {
      assert.equal(typeof message(locale, key), 'string', `${locale}: ${page} → ${key}`)
    }
  }
})

test('every page description key exists in every language, for a known page', () => {
  assert.ok(Object.keys(descriptionKeys).length >= 2)
  for (const [page, key] of Object.entries(descriptionKeys)) {
    assert.ok(page in titleKeys, page)
    for (const locale of locales) assert.equal(typeof message(locale, key), 'string', `${locale}: ${page} → ${key}`)
  }
})

test('every layout names a known page', () => {
  for (const [route, { page }] of Object.entries(layouts())) assert.ok(page in titleKeys, `${route}: ${page}`)
})

test('the sitemap lists no page that is marked noindex', () => {
  require('./register.cjs')
  const { INDEXED_PATHS } = require('../src/core/searchIndex.ts')
  const found = layouts()
  for (const { path: page } of INDEXED_PATHS) {
    assert.ok(!found[page]?.options.includes('personal: true'), `${page} is in the sitemap but noindex`)
  }
  // The gallery and share links set noindex in their own layouts.
  for (const page of ['/gallery']) assert.ok(!INDEXED_PATHS.some(entry => entry.path === page), page)
})

test('pages that show only the visitor\'s own data are noindex', () => {
  const found = layouts()
  for (const page of ['/home', '/records', '/rankings', '/edit', '/words', '/devices', '/interests', '/create', '/packs/create', '/packs/edit']) {
    assert.ok(found[page]?.options.includes('personal: true'), page)
  }
})
