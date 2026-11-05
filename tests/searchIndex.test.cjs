require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { INDEXED_PATHS, DISALLOWED_PATHS, sitemapEntries, robotsRules } = require('../src/core/searchIndex.ts')

const site = 'https://typle-r-six.vercel.app'

test('the sitemap lists the public pages under the site origin', () => {
  const urls = sitemapEntries(site).map(entry => entry.url)
  assert.deepEqual(urls, [
    `${site}/home`, `${site}/play`, `${site}/gallery`, `${site}/guide`, `${site}/about`,
  ])
})

test('a path or trailing slash on the site URL does not leak into the entries', () => {
  assert.equal(sitemapEntries(`${site}/`).at(0).url, `${site}/home`)
  assert.equal(sitemapEntries(`${site}/api/auth`).at(0).url, `${site}/home`)
  assert.equal(robotsRules(`${site}/`).sitemap, `${site}/sitemap.xml`)
})

test('robots.txt keeps crawlers out of admin, the development login and the backend', () => {
  const robots = robotsRules(site)
  assert.equal(robots.rules.userAgent, '*')
  assert.equal(robots.rules.allow, '/')
  assert.deepEqual(robots.rules.disallow, ['/admin', '/local-login', '/api/'])
  assert.equal(robots.sitemap, `${site}/sitemap.xml`)
  assert.equal(robots.host, site)
})

test('no listed page is also disallowed', () => {
  for (const { path: page } of INDEXED_PATHS) {
    for (const blocked of DISALLOWED_PATHS) assert.ok(!page.startsWith(blocked), `${page} is under ${blocked}`)
  }
})

test('every listed page exists in the app', () => {
  const app = path.join(__dirname, '..', 'src', 'app')
  const pages = new Set()
  const walk = (dir, route) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        if (entry.name === 'page.tsx') pages.add(route || '/')
        continue
      }
      // Route groups like (workspace) do not add a path segment.
      const segment = /^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`
      walk(path.join(dir, entry.name), route + segment)
    }
  }
  walk(app, '')
  for (const { path: page } of INDEXED_PATHS) assert.ok(pages.has(page), `${page} has no page.tsx`)
})
