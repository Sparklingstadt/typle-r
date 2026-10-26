import { randomBytes } from 'node:crypto'
import type { BrowserContext } from '@playwright/test'
import { sealSession } from './sessionCookie'

// The app's origin and session secret in the end-to-end setup (playwright.config.ts).
export const origin = 'http://127.0.0.1:3101'
export const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
// The Go backend's login cookie over HTTP; the sealed value is what it sets after GitHub.
export const cookieName = 'typle-session'

/** A GitHub account id no other test uses. */
export const newAccountId = () => 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()

/** A login cookie value for the account, valid for an hour. */
export function sessionFor(sub: string, name = 'E2E User') {
  const iat = Math.floor(Date.now() / 1000)
  return sealSession(secret, { sub, name, image: '', iat, exp: iat + 3600 })
}

/** Signs the browser context in as the account. */
export async function signIn(context: BrowserContext, accountId: string, name = 'E2E User') {
  await context.addCookies([{ name: cookieName, value: sessionFor(accountId, name), url: origin, httpOnly: true, sameSite: 'Lax' }])
}

/** Runs queries against the test database, closing the connection afterwards. */
export async function withDatabase<T>(run: (pool: import('pg').Pool) => Promise<T>): Promise<T> {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try { return await run(pool) } finally { await pool.end() }
}

/** Deletes the account's saved workspace. */
export const deleteWorkspace = (accountId: string) =>
  withDatabase(pool => pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId]))
