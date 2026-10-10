import { test, expect, request as playwrightRequest, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { randomBytes } from 'node:crypto'
const origin = 'http://127.0.0.1:3101'
const secret = 'typle-e2e-only-not-a-production-secret-32-bytes'
const accounts: string[] = []

test.afterEach(async () => {
  if (!accounts.length) return
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    for (const accountId of accounts) {
      await pool.query('DELETE FROM typle_api_tokens WHERE owner_id = $1', [accountId])
      await pool.query('DELETE FROM typle_shared_lists WHERE owner_id = $1', [accountId])
      await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId])
    }
  } finally { await pool.end() }
  accounts.length = 0
})

async function signIn(context: BrowserContext) {
  const accountId = 'github:' + BigInt('0x' + randomBytes(16).toString('hex')).toString()
  accounts.push(accountId)
  const token = await encode({ token: { sub: accountId, name: 'E2E User' }, secret, salt: 'authjs.session-token' })
  await context.addCookies([{ name: 'authjs.session-token', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }])
}

async function issue(session: APIRequestContext, scope: 'read' | 'write', name = 'E2E') {
  const response = await session.post('/api/tokens', { headers: { Origin: origin }, data: { name, scope, expiresIn: 30 } })
  expect(response.status()).toBe(201)
  return await response.json() as { token: { id: string }; secret: string }
}

const bearer = (token: string) => playwrightRequest.newContext({ baseURL: origin, extraHTTPHeaders: { Authorization: 'Bearer ' + token } })

test('token management requires the session and the origin', async ({ context, page }) => {
  expect((await page.request.get('/api/tokens')).status()).toBe(401)
  await signIn(context)
  const data = { name: ' Script ', scope: 'read', expiresIn: 90 }
  expect((await page.request.post('/api/tokens', { data })).status()).toBe(403)
  expect((await page.request.post('/api/tokens', { headers: { Origin: 'https://evil.example' }, data })).status()).toBe(403)

  const created = await page.request.post('/api/tokens', { headers: { Origin: origin }, data })
  expect(created.status()).toBe(201)
  const body = await created.json()
  expect(body.secret).toMatch(/^typle_/)
  expect(body.token).toMatchObject({ name: 'Script', scope: 'read', prefix: body.secret.slice(0, 10) })
  expect((await page.request.post('/api/tokens', { headers: { Origin: origin }, data: { ...data, name: ' ' } })).status()).toBe(400)

  const listed = await page.request.get('/api/tokens')
  expect(listed.status()).toBe(200)
  const text = await listed.text()
  expect(JSON.parse(text).tokens).toHaveLength(1)
  expect(text).not.toContain(body.secret)
  expect(text).not.toContain('secret')

  // A Bearer token cannot manage tokens.
  const api = await bearer(body.secret)
  expect((await api.get('/api/tokens')).status()).toBe(401)
  await api.dispose()
})

test('a write token manages lists and records', async ({ context, page }) => {
  await signIn(context)
  const { secret: token } = await issue(page.request, 'write')
  const api = await bearer(token)

  const profiles = await api.get('/api/v1/profiles')
  expect(profiles.status()).toBe(200)
  expect(profiles.headers()['cache-control']).toBe('no-store')
  expect((await profiles.json()).profiles[0]).toMatchObject({ id: 'default' })
  expect((await api.get('/api/v1/devices')).status()).toBe(200)

  const base = '/api/v1/profiles/default/lists'
  const created = await api.post(base, { data: { name: 'API', words: [{ display: '猫', input: 'neko' }] } })
  expect(created.status()).toBe(201)
  const { list } = await created.json()
  expect(list).toMatchObject({ name: 'API', wordCount: 1, recordCount: 0, shared: false })
  expect(list.words).toEqual([{ display: '猫', input: 'neko', annotation: '' }])

  const listed = await (await api.get(base)).json()
  expect(listed.lists.map((item: { name: string }) => item.name)).toContain('API')

  const patched = await api.patch(`${base}/${list.id}`, {
    data: { words: [{ display: '猫', input: 'neko' }, { display: '犬', input: 'inu', annotation: 'いぬ' }] },
  })
  expect(patched.status()).toBe(200)
  expect((await patched.json()).list).toMatchObject({ id: list.id, name: 'API', wordCount: 2 })
  expect((await (await api.get(`${base}/${list.id}`)).json()).list.wordCount).toBe(2)

  const record = { id: 'run-1', time: 3.2, date: new Date().toISOString(), mistakes: 0, accuracy: 100 }
  const first = await api.post(`${base}/${list.id}/records`, { data: record })
  expect(first.status()).toBe(201)
  expect((await first.json()).record).toMatchObject({ id: 'run-1', time: 3.2, wordCount: 2 })
  expect((await api.post(`${base}/${list.id}/records`, { data: record })).status()).toBe(200)
  const records = await (await api.get(`${base}/${list.id}/records`)).json()
  expect(records.records).toHaveLength(1)
  expect((await api.get(`${base}/${list.id}/records?limit=0`)).status()).toBe(400)

  const missingProfile = await api.get('/api/v1/profiles/nope/lists')
  expect(missingProfile.status()).toBe(404)
  expect(await missingProfile.json()).toEqual({ error: 'profileNotFound' })
  const missingList = await api.get(`${base}/nope`)
  expect(missingList.status()).toBe(404)
  expect(await missingList.json()).toEqual({ error: 'listNotFound' })

  const wrongType = await api.patch(`${base}/${list.id}`, { headers: { 'Content-Type': 'text/plain' }, data: '{"name":"X"}' })
  expect(wrongType.status()).toBe(415)
  const badJson = await api.patch(`${base}/${list.id}`, { headers: { 'Content-Type': 'application/json' }, data: Buffer.from('{') })
  expect(badJson.status()).toBe(400)
  expect(await badJson.json()).toEqual({ error: 'invalidJson' })

  const huge = await api.post(base, { headers: { 'Content-Type': 'application/json' }, data: Buffer.alloc(1024 * 1024 + 1, 'a') })
  expect(huge.status()).toBe(413)

  expect((await api.delete(`${base}/${list.id}`)).status()).toBe(204)
  expect((await api.get(`${base}/${list.id}`)).status()).toBe(404)
  await api.dispose()
})

test('a read token cannot write, and revoked or missing tokens are rejected', async ({ browser, context, page }) => {
  await signIn(context)
  const { token, secret: readSecret } = await issue(page.request, 'read')
  const api = await bearer(readSecret)
  expect((await api.get('/api/v1/profiles')).status()).toBe(200)
  const denied = await api.post('/api/v1/profiles/default/lists', { data: { name: 'No', words: [{ display: 'a', input: 'a' }] } })
  expect(denied.status()).toBe(403)
  expect(await denied.json()).toEqual({ error: 'insufficientScope' })

  // A second account cannot revoke this token and cannot tell it exists.
  const otherContext = await browser.newContext()
  await signIn(otherContext)
  const other = await otherContext.request.delete(`/api/tokens/${token.id}`, { headers: { Origin: origin } })
  expect(other.status()).toBe(404)
  await otherContext.close()
  expect((await api.get('/api/v1/profiles')).status()).toBe(200)

  expect((await page.request.delete(`/api/tokens/${token.id}`)).status()).toBe(403)
  expect((await page.request.delete(`/api/tokens/${token.id}`, { headers: { Origin: origin } })).status()).toBe(204)
  const revoked = await api.get('/api/v1/profiles')
  expect(revoked.status()).toBe(401)
  expect(await revoked.json()).toEqual({ error: 'invalidToken' })
  expect((await page.request.delete(`/api/tokens/${token.id}`, { headers: { Origin: origin } })).status()).toBe(404)
  await api.dispose()

  const anonymous = await playwrightRequest.newContext({ baseURL: origin })
  const missing = await anonymous.get('/api/v1/profiles')
  expect(missing.status()).toBe(401)
  expect(await missing.json()).toEqual({ error: 'invalidToken' })
  await anonymous.dispose()
})

test('anonymous API access is rejected', async ({ request }) => {
  const profiles = await request.get('/api/v1/profiles')
  expect(profiles.status()).toBe(401)
  expect(profiles.headers()['access-control-allow-origin']).toBeUndefined()
  expect((await request.get('/api/tokens')).status()).toBe(401)
})
