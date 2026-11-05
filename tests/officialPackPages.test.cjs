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

test('the sitemap lists every pack page after the fixed pages', () => {
  const entries = sitemapEntries('https://typle.sparklingstadt.com', officialPackPagePaths())
  const packs = entries.filter(entry => entry.url.startsWith('https://typle.sparklingstadt.com/packs/') && !entry.url.endsWith('/catalog'))
  assert.deepEqual(packs.map(entry => entry.url), OFFICIAL_PACK_PAGES.map(page => `https://typle.sparklingstadt.com/packs/${page.slug}`))
  for (const entry of packs) assert.equal(entry.priority, PACK_PAGE_PRIORITY)
})
