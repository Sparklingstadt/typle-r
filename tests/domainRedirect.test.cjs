const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// The site moved to typle.sparklingstadt.com. typle-r-six.vercel.app stays for the iPad and Mac apps, which call
// /api/* there, so vercel.json sends only its pages and the start of a login to the custom domain.
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'))
const SITE = 'https://typle.sparklingstadt.com'
const legacy = /^typle-r-six\\\.vercel\\\.app$/

// Vercel's sources: a fixed path, or /:path(<regular expression>). Enough of path-to-regexp for these rules.
function matches(source, pathname) {
  const custom = source.match(/^\/:path\((.*)\)$/)
  if (custom) return new RegExp(`^/(?:${custom[1]})$`).test(pathname)
  return source === pathname
}

const redirectOf = pathname => config.redirects.find(rule => matches(rule.source, pathname))

test('every redirect applies only to the Vercel domain and goes to the custom domain', () => {
  assert.ok(config.redirects.length > 0)
  for (const rule of config.redirects) {
    assert.deepEqual(rule.has.map(condition => condition.type), ['host'], rule.source)
    assert.match(rule.has[0].value, legacy, rule.source)
    assert.ok(rule.destination.startsWith(`${SITE}/`), rule.destination)
  }
})

test('pages move to the custom domain for good', () => {
  for (const page of ['/', '/home', '/play', '/packs/catalog', '/sitemap.xml', '/_next/static/chunk.js']) {
    const rule = redirectOf(page)
    assert.ok(rule, page)
    assert.equal(rule.permanent, true, page)
  }
})

test('the apps keep calling the API at the Vercel domain', () => {
  for (const api of ['/api/workspace', '/api/workspace/records', '/api/auth/token', '/api/auth/session', '/api/auth/callback/github', '/api/shared', '/api/graphql', '/api/health']) {
    assert.equal(redirectOf(api), undefined, api)
  }
})

test('a login started at the Vercel domain moves to the custom domain, so its cookie and the callback share a host', () => {
  const rule = redirectOf('/api/auth/signin')
  assert.ok(rule)
  assert.equal(rule.destination, `${SITE}/api/auth/signin`)
  // Temporary: an app may start its login at the Vercel domain again after a later change.
  assert.equal(rule.permanent, false)
})
