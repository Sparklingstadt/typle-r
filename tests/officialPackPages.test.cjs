require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { OFFICIAL_PACK_PAGES, officialPackPage, officialPackPagePaths } = require('../src/plugins/packs/pages.ts')
const { officialPacks } = require('../src/plugins/packs/catalog.ts')
const { sitemapEntries, PACK_PAGE_PRIORITY } = require('../src/core/searchIndex.ts')

test('every page names an official pack, once, under a slug of its own', () => {
  assert.ok(OFFICIAL_PACK_PAGES.length >= 10)
  const catalogIds = new Set(officialPacks().map(entry => entry.catalogId))
  assert.equal(new Set(OFFICIAL_PACK_PAGES.map(page => page.slug)).size, OFFICIAL_PACK_PAGES.length)
  assert.equal(new Set(OFFICIAL_PACK_PAGES.map(page => page.catalogId)).size, OFFICIAL_PACK_PAGES.length)
  for (const page of OFFICIAL_PACK_PAGES) {
    assert.match(page.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, page.slug)
    assert.ok(catalogIds.has(page.catalogId), page.catalogId)
    assert.ok(officialPackPage(page.slug), page.slug)
  }
})

test('no slug takes the path of another page under /packs', () => {
  const packs = path.join(__dirname, '../src/app/(workspace)/packs')
  const taken = fs.readdirSync(packs, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  assert.ok(taken.includes('catalog'))
  for (const page of OFFICIAL_PACK_PAGES) assert.ok(!taken.includes(page.slug), page.slug)
})

test('every description fits a search result and is written for that pack', () => {
  for (const page of OFFICIAL_PACK_PAGES) {
    const length = Array.from(page.description).length
    assert.ok(length >= 40 && length <= 160, `${page.slug}: ${length} characters`)
  }
  assert.equal(new Set(OFFICIAL_PACK_PAGES.map(page => page.description)).size, OFFICIAL_PACK_PAGES.length)
})

test('an unknown slug has no page', () => {
  assert.equal(officialPackPage('no-such-pack'), null)
  assert.equal(officialPackPage('catalog'), null)
})

test('every official pack has a page', () => {
  const paged = new Set(OFFICIAL_PACK_PAGES.map(page => page.catalogId))
  for (const entry of officialPacks()) assert.ok(paged.has(entry.catalogId), entry.catalogId)
})

test('a canonical page is another page that has no canonical of its own', () => {
  const canonicals = OFFICIAL_PACK_PAGES.filter(page => page.canonical)
  assert.ok(canonicals.length > 0)
  for (const page of canonicals) {
    const target = OFFICIAL_PACK_PAGES.find(item => item.slug === page.canonical)
    assert.ok(target && target.slug !== page.slug, page.slug)
    assert.equal(target.canonical, undefined, page.slug)
  }
})

test('the sitemap lists every pack page but the ones that point to another, after the fixed pages', () => {
  const entries = sitemapEntries('https://typle.sparklingstadt.com', officialPackPagePaths())
  const packs = entries.filter(entry => entry.url.startsWith('https://typle.sparklingstadt.com/packs/') && !entry.url.endsWith('/catalog'))
  const listed = OFFICIAL_PACK_PAGES.filter(page => !page.canonical)
  assert.deepEqual(packs.map(entry => entry.url), listed.map(page => `https://typle.sparklingstadt.com/packs/${page.slug}`))
  for (const entry of packs) assert.equal(entry.priority, PACK_PAGE_PRIORITY)
})
