import { createHmac, hkdfSync } from 'node:crypto'

export type SessionClaims = { sub: string; name: string; image: string; iat: number; exp: number }

// Forges a login cookie the Go server accepts, so the end-to-end tests can sign in without GitHub. It must stay byte
// for byte what server/internal/session produces: the same key derivation, and the JSON keys in the same order.
export function sealSession(secret: string, session: SessionClaims): string {
  const key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'typle session v1', 32))
  const { sub, name, image, iat, exp } = session
  const payload = Buffer.from(JSON.stringify({ sub, name, image, iat, exp })).toString('base64url')
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`
}
