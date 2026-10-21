import { createHmac, hkdfSync } from 'node:crypto'

export type SessionClaims = { sub: string; name: string; image: string; iat: number; exp: number }

// Forges a login cookie the Go server accepts, so the end-to-end tests can sign in without GitHub. It must stay byte
// for byte what server/internal/session produces: the same key derivation, the JSON keys in the same order, and the same
// escapes.
export function sealSession(secret: string, session: SessionClaims): string {
  const key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'typle session v1', 32))
  const { sub, name, image, iat, exp } = session
  // Go's encoder writes U+2028 and U+2029 escaped (and & < > as they are, as JSON.stringify does), so they are escaped here too.
  const json = JSON.stringify({ sub, name, image, iat, exp }).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  const payload = Buffer.from(json).toString('base64url')
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`
}
