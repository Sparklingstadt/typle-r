const assert = require('node:assert/strict')
const { test, after } = require('node:test')
const { Pool } = require('pg')
const fixture = require('./workspace.json')
const auth = require('./auth.cjs')

const targets = JSON.parse(process.env.TYPLE_COMPAT_TARGETS || 'null')
assert.ok(Array.isArray(targets) && targets.length > 0, 'Run npm run test:compat or test:compat:matrix')
assert.ok(process.env.TYPLE_TEST_DATABASE_URL, 'A migrated test-only database is required')
const pool = new Pool({ connectionString: process.env.TYPLE_TEST_DATABASE_URL })
const owners = []
function owner() { const id = auth.newOwner(); owners.push(id); return id }
after(async () => {
  try { for (const id of owners) await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [id]) }
  finally { await pool.end() }
})
const security = {
  'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin',
}
function client(target, accountId) {
  const token = auth.session(accountId)
  return async function request(method, pathname, body, options = {}) {
    const headers = { Authorization: `Bearer ${token}`, ...options.headers }
    if (body !== undefined && !('Content-Type' in headers)) headers['Content-Type'] = 'application/json'
    const response = await fetch(target.url + pathname, {
      method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      redirect: 'manual', signal: AbortSignal.timeout(15000),
    })
    const text = await response.text()
    for (const [name, expected] of Object.entries(security)) assert.equal(response.headers.get(name), expected, name)
    if (response.headers.get('content-type')?.startsWith('application/json')) {
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      assert.equal(response.headers.get('vary'), 'Cookie')
    }
    if (options.status !== undefined) assert.equal(response.status, options.status, `${method} ${pathname}: ${text}`)
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null }
  }
}
const valid = accountId => ({ ...structuredClone(fixture.saved), accountId, revision: 0 })
const put = (request, body, status = 200, headers) => request('PUT', '/api/workspace', body, { status, headers })
const get = (request, status = 200, headers) => request('GET', '/api/workspace', undefined, { status, headers })

for (const target of targets) {
  test(`${target.name}: anonymous, bearer/cookie separation, account ownership and CSRF`, async () => {
    const accountId = owner(), request = client(target, accountId)
    assert.deepEqual((await get(request, 401, { Authorization: '' })).body, { error: 'loginRequired' })
    const cookie = `typle-session=${auth.session(accountId, 0, 'session')}`
    assert.equal((await get(request, 200, { Authorization: '', Cookie: cookie })).body.accountId, accountId)
    for (const authorization of ['Bearer invalid', `Bearer ${auth.session(accountId, 0, 'session')}`, `bearer ${auth.session(accountId)}`]) {
      assert.deepEqual((await get(request, 401, { Authorization: authorization, Cookie: cookie })).body, { error: 'loginRequired' })
    }
    const changed = await put(request, { ...valid(accountId), accountId: owner() }, 401)
    assert.deepEqual(changed.body, { error: 'loginAccountChanged' })
    for (const origin of ['', 'https://attacker.invalid']) {
      const response = await put(request, valid(accountId), 403, { Authorization: '', Cookie: cookie, Origin: origin })
      assert.deepEqual(response.body, { error: 'forbiddenRequest' })
    }
    await put(request, valid(accountId), 200, { Authorization: '', Cookie: cookie, Origin: auth.origin })
    assert.equal((await get(client(target, owner()))).body.revision, 0)
    assert.deepEqual((await put(request, { accountId, revision: 1 }, 403, { 'Content-Type': 'text/plain' })).body, { error: 'forbiddenRequest' })
  })

  test(`${target.name}: Android PKCE, token exchange, expiry and renewal`, async () => {
    const accountId = owner(), request = client(target, accountId)
    const signin = await fetch(`${target.url}/api/auth/signin?client=android&code_challenge=${auth.challenge}`, { redirect: 'manual' })
    assert.equal(signin.status, 302)
    const location = new URL(signin.headers.get('location'))
    assert.equal(location.origin, 'https://github.com')
    assert.equal(location.searchParams.get('redirect_uri'), `${auth.origin}/api/auth/callback/github`)
    assert.notEqual(location.searchParams.get('code_challenge'), auth.challenge, 'GitHub uses the server PKCE')
    const badChallenge = await fetch(`${target.url}/api/auth/signin?client=android&code_challenge=short`, { redirect: 'manual' })
    assert.equal(badChallenge.headers.get('location'), 'typle-r://login?error=loginFailed')
    const traded = await request('POST', '/api/auth/token', { code: auth.code(accountId), verifier: auth.verifier }, { status: 200 })
    assert.equal(traded.headers.get('set-cookie'), null)
    assert.equal(traded.body.user.id, accountId)
    assert.equal(typeof traded.body.token, 'string')
    for (const backend of targets) {
      const session = await client(backend, accountId)('GET', '/api/auth/session', undefined,
        { status: 200, headers: { Authorization: `Bearer ${traded.body.token}` } })
      assert.equal(session.body.user.id, accountId, `${target.name} token must open in ${backend.name}`)
    }
    for (const body of [
      { code: auth.code(accountId), verifier: 'x'.repeat(43) },
      { code: auth.code(accountId, Math.floor(Date.now() / 1000) - 1), verifier: auth.verifier },
      { code: auth.session(accountId), verifier: auth.verifier },
    ]) assert.deepEqual((await request('POST', '/api/auth/token', body, { status: 400 })).body, { error: 'loginFailed' })
    const renewed = await request('GET', '/api/auth/session', undefined,
      { status: 200, headers: { Authorization: `Bearer ${auth.session(accountId, 25 * 3600)}` } })
    assert.equal(renewed.headers.get('set-cookie'), null)
    assert.equal(typeof renewed.body.token, 'string')
    for (const backend of targets) {
      assert.equal((await get(client(backend, accountId), 200, { Authorization: `Bearer ${renewed.body.token}` })).body.accountId, accountId)
    }
    assert.deepEqual((await request('GET', '/api/auth/session', undefined,
      { status: 200, headers: { Authorization: `Bearer ${auth.session(accountId, 31 * 86400)}` } })).body, { user: null })
  })

  test(`${target.name}: saved JSON, legacy records, labels, unknown fields, partial updates and stale revisions`, async () => {
    const accountId = owner(), request = client(target, accountId)
    assert.deepEqual((await get(request)).body, { lists: [], devices: [], revision: 0, accountId })
    const body = valid(accountId)
    const saved = (await put(request, body)).body
    assert.deepEqual(saved, { ...body, revision: 1 })
    assert.deepEqual((await get(request)).body, saved)
    assert.deepEqual((await put(request, body, 409)).body, { error: 'conflict' })
    const nextDevices = [{ id: 'new', name: ' 別端末 ', layout: ' US ' }]
    const partial = (await put(request, { accountId, revision: 1, devices: nextDevices })).body
    assert.deepEqual(partial.lists, saved.lists)
    assert.deepEqual(partial.devices, [{ id: 'new', name: '別端末', layout: 'US' }])
    assert.equal(partial.revision, 2)
    assert.deepEqual((await put(request, { accountId, revision: 2 })).body, { ...partial, revision: 3 })
    for (const legacy of [{ profileId: 'removed' }, { profiles: [] }]) {
      assert.deepEqual((await put(request, { accountId, revision: 3, ...legacy }, 409)).body, { error: 'conflict' })
    }
    const head = await request('HEAD', '/api/workspace', undefined, { status: 200 })
    assert.equal(head.body, null)
    assert.equal(head.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual((await request('DELETE', '/api/workspace', undefined, { status: 405 })).body, { error: 'methodNotAllowed' })
    assert.equal((await get(request)).body.revision, 3, 'refused writes leave data and revision untouched')
  })

  test(`${target.name}: common list limit and label validation boundaries`, async () => {
    const accountId = owner(), request = client(target, accountId)
    const base = valid(accountId)
    base.lists = Array.from({ length: fixture.limits.lists }, (_, i) => ({ ...base.lists[0], id: `list-${i}` }))
    assert.equal((await put(request, base)).body.lists.length, fixture.limits.lists)
    assert.deepEqual((await put(request, { ...base, revision: 1, lists: [...base.lists, { ...base.lists[0], id: 'over' }] }, 400)).body,
      { error: 'listLimit' })
    for (const patch of [
      { category: 42 }, { category: 'a'.repeat(fixture.limits.category + 1) },
      { tags: 'bad' }, { tags: [null] }, { tags: ['a'.repeat(fixture.limits.tag + 1)] },
      { tags: Array(fixture.limits.tags + 1).fill('tag') },
    ]) {
      const body = { ...valid(accountId), revision: 1 }
      Object.assign(body.lists[0], patch)
      assert.deepEqual((await put(request, body, 400)).body, { error: 'invalidWorkspace' })
    }
    const boundary = { ...valid(accountId), revision: 1 }
    Object.assign(boundary.lists[0], { category: 'a'.repeat(fixture.limits.category), tags: Array(fixture.limits.tags).fill('a'.repeat(fixture.limits.tag)) })
    await put(request, boundary)
  })

  test(`${target.name}: invalid JSON, revisions, storage escapes and request byte limit`, async () => {
    const accountId = owner(), request = client(target, accountId)
    for (const revision of [-1, 0.5, '0', null, 9007199254740992]) {
      assert.deepEqual((await put(request, { ...valid(accountId), revision }, 400)).body, { error: 'invalidWorkspace' })
    }
    for (const field of ['lists', 'devices']) {
      assert.deepEqual((await put(request, { ...valid(accountId), [field]: null }, 400)).body, { error: 'invalidWorkspace' })
    }
    for (const value of ['nul\u0000', '\ud800']) {
      const body = valid(accountId)
      body.lists[0].futureList = value
      assert.deepEqual((await put(request, body, 400)).body, { error: 'invalidWorkspace' })
    }
    assert.deepEqual((await put(request, '{', 400)).body, { error: 'invalidWorkspace' })
    assert.deepEqual((await put(request, 'a'.repeat((1 << 20) + 1), 413)).body, { error: 'workspaceTooLarge' })
    assert.equal((await get(request)).body.revision, 0)
  })
}

if (targets.length > 1) test('Go -> Kotlin -> Go: same database row, CAS race and unknown data survive backend switches', async () => {
  const accountId = owner()
  const [go, kotlin] = targets.map(target => client(target, accountId))
  const first = (await put(go, valid(accountId))).body
  assert.deepEqual((await get(kotlin)).body, first)
  const changed = structuredClone(first)
  changed.lists[0].name = 'Kotlin が更新'
  const second = (await put(kotlin, changed)).body
  assert.deepEqual((await get(go)).body, second)
  const race = await Promise.all([go('PUT', '/api/workspace', { accountId, revision: 2, devices: [] }), kotlin('PUT', '/api/workspace', { accountId, revision: 2, devices: [] })])
  assert.deepEqual(race.map(value => value.status).sort(), [200, 409])
  const kept = (await get(go)).body
  assert.equal(kept.revision, 3)
  assert.deepEqual(kept.lists, second.lists)
  assert.deepEqual((await get(kotlin)).body, kept)
})
