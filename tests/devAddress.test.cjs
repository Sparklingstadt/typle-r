const assert = require('node:assert/strict')
const test = require('node:test')
const { webAddress } = require('../scripts/dev.cjs')

test('typle-web listens where TYPLE_WEB_URL points', () => {
  assert.equal(webAddress(undefined), '127.0.0.1:8081')
  assert.equal(webAddress(''), '127.0.0.1:8081')
  assert.equal(webAddress('http://127.0.0.1:8081'), '127.0.0.1:8081')
  assert.equal(webAddress('http://127.0.0.1:9000/'), '127.0.0.1:9000')
  assert.equal(webAddress('http://localhost:9001'), 'localhost:9001')
  assert.equal(webAddress('http://[::1]:9002'), '[::1]:9002')
  assert.equal(webAddress('http://localhost'), 'localhost:80')
})

// typle-web speaks plain HTTP only, so an https:// URL could never be reached: npm run dev stops at once and says so.
test('a TYPLE_WEB_URL with https is refused', () => {
  for (const value of ['https://backend.test', 'https://127.0.0.1:8081', 'HTTPS://localhost:9000']) {
    assert.throws(() => webAddress(value), error => /TYPLE_WEB_URL/.test(error.message) && /https/.test(error.message) && /HTTP/.test(error.message), value)
  }
})

test('a TYPLE_WEB_URL that is not an http URL is refused', () => {
  for (const value of ['localhost:8081', 'ftp://x', 'not a url', 'http://']) {
    assert.throws(() => webAddress(value), /TYPLE_WEB_URL/, value)
  }
})
