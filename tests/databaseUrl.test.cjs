require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { strictSslUrl } = require('../src/plugins/storage/cloud/databaseUrl.ts')

const base = 'postgresql://user:p%40ss@ep-x.aws.neon.tech/neondb'

// pg already treats these modes as verify-full; naming it keeps that when pg v9 changes their meaning.
test('the SSL modes pg treats as verify-full are named verify-full', () => {
  for (const mode of ['prefer', 'require', 'verify-ca']) {
    const url = new URL(strictSslUrl(`${base}?sslmode=${mode}&channel_binding=require`))
    assert.equal(url.searchParams.get('sslmode'), 'verify-full')
    assert.equal(url.searchParams.get('channel_binding'), 'require')
    assert.equal(url.password, 'p%40ss')
  }
})

test('other connection strings are left as they are', () => {
  for (const url of [base, `${base}?sslmode=disable`, `${base}?sslmode=verify-full`, `${base}?sslmode=require&uselibpqcompat=true`,
    'postgresql://typle@127.0.0.1:5432/typle']) {
    assert.equal(strictSslUrl(url), url)
  }
})
