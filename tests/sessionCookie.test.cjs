require('./register.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { sealSession } = require('./e2e/sessionCookie.ts')

// The same input and output as TestVector in server/internal/session/session_test.go: the Go server must open what the
// E2E tests seal here.
const VECTOR =
  'eyJzdWIiOiJnaXRodWI6MSIsIm5hbWUiOiJFMkUgVXNlciIsImltYWdlIjoiIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDI1OTIwMDB9.PnYQedkDC_8_wH2YdnWBCStw6T-q-WuuzlkmghaPRro'

test('sealSession produces the cookie the Go server produces', () => {
  const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
  const session = { sub: 'github:1', name: 'E2E User', image: '', iat: 1700000000, exp: 1702592000 }
  assert.equal(sealSession(secret, session), VECTOR)
})

// The same as TestEscapedVector: & < > are written as they are, and U+2028 as \u2028, as Go's encoder writes them.
const ESCAPED_VECTOR =
  'eyJzdWIiOiJnaXRodWI6MiIsIm5hbWUiOiJBICYgQiA8eD5cdTIwMjgiLCJpbWFnZSI6IiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAyNTkyMDAwfQ.kC3xQIvDOm0YGs1xA85LEKb4SB8PCoSntK11CucuLmk'

test('sealSession writes a name with & < > and U+2028 as the Go server does', () => {
  const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
  const session = { sub: 'github:2', name: 'A & B <x>\u2028', image: '', iat: 1700000000, exp: 1702592000 }
  assert.equal(sealSession(secret, session), ESCAPED_VECTOR)
})
