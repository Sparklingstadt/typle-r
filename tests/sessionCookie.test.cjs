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
