const { createHmac, createHash, hkdfSync, randomBytes } = require('node:crypto')

// Public test material only. Never read AUTH_SECRET from .env.local or use production accounts.
const secret = 'typle-contract-only-not-a-production-secret'
const origin = 'http://127.0.0.1:3101'
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const challenge = createHash('sha256').update(verifier).digest('base64url')
function seal(kind, fields) {
  const json = JSON.stringify(fields).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
  const payload = Buffer.from(json).toString('base64url')
  const key = hkdfSync('sha256', secret, Buffer.alloc(0), `typle ${kind} v1`, 32)
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`
}
function session(sub, age = 0, kind = 'app session') {
  const iat = Math.floor(Date.now() / 1000) - age
  return seal(kind, { sub, name: '契約 <&> \u2028😀', image: '', iat, exp: iat + 30 * 86400 })
}
function code(sub, expires = Math.floor(Date.now() / 1000) + 120) {
  return seal('app code', { sub, name: '契約 <&> \u2028😀', image: '', challenge, exp: expires })
}
const newOwner = () => `github:${BigInt('0x' + randomBytes(16).toString('hex'))}`
module.exports = { secret, origin, verifier, challenge, session, code, newOwner }
