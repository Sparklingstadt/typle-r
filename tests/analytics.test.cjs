require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { analyticsUrl } = require('../src/core/analytics.ts')

const site = 'https://typle-r-six.vercel.app'

test('a page view keeps the origin and the path', () => {
  assert.equal(analyticsUrl(`${site}/play`), `${site}/play`)
  assert.equal(analyticsUrl(`${site}/shared/abc123`), `${site}/shared/abc123`)
})

test('query strings and fragments are dropped', () => {
  assert.equal(analyticsUrl(`${site}/rankings?list=l1&mode=recall`), `${site}/rankings`)
  assert.equal(analyticsUrl(`${site}/guide#storage`), `${site}/guide`)
  assert.equal(analyticsUrl(`${site}/records?pack=p1#top`), `${site}/records`)
})

test('the admin screen and the development login are not sent', () => {
  assert.equal(analyticsUrl(`${site}/admin`), null)
  assert.equal(analyticsUrl(`${site}/admin/gallery`), null)
  assert.equal(analyticsUrl(`${site}/local-login?next=/play`), null)
})

test('a path that only starts with the same letters is still sent', () => {
  assert.equal(analyticsUrl(`${site}/administrator`), `${site}/administrator`)
})

test('a URL that cannot be read is not sent', () => {
  assert.equal(analyticsUrl('not a url'), null)
  assert.equal(analyticsUrl(''), null)
})
