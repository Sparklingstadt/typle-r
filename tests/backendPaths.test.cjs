const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

// The Go backend's paths are listed in three places: vercel.json sends them to api/index.go on Vercel, next.config.mjs
// forwards them to the local Go backend, and server/internal/web routes them. A path missing from one of the first two
// answers with the Next.js 404 page there instead of the backend.
const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const vercel = JSON.parse(read('vercel.json'))
const vercelSources = vercel.rewrites.map(rewrite => rewrite.source)

function nextSources() {
  const config = read('next.config.mjs')
  const list = config.match(/beforeFiles:\s*\[([^\]]*)\]/)
  assert.ok(list, 'next.config.mjs has a beforeFiles list')
  return [...list[1].matchAll(/'([^']+)'/g)].map(match => match[1])
}

function webRoutes() {
  const dir = path.join(root, 'server/internal/web')
  const sources = fs.readdirSync(dir).filter(file => file.endsWith('.go') && !file.endsWith('_test.go'))
    .map(file => fs.readFileSync(path.join(dir, file), 'utf8')).join('\n')
  const constants = Object.fromEntries([...sources.matchAll(/^\s*(\w+)\s*=\s*"(\/api\/[^"]*)"/gm)].map(m => [m[1], m[2]]))
  const routes = [...sources.matchAll(/mux\.HandleFunc\((?:"([^"]+)"|(\w+))/g)].map(m => m[1] ?? constants[m[2]])
  assert.ok(routes.every(Boolean), `every route resolves to a path: ${routes}`)
  return routes.filter(route => route !== '/')
}

// A rewrite source with :path* covers its prefix and any path below it, as both Vercel and Next.js read it.
function covers(source, route) {
  if (source.endsWith('/:path*')) {
    const prefix = source.slice(0, -'/:path*'.length)
    return route === prefix || route.startsWith(prefix + '/')
  }
  return source === route
}

test('vercel.json sends every backend path to the one Go function', () => {
  assert.ok(vercelSources.length > 0)
  for (const rewrite of vercel.rewrites) assert.equal(rewrite.destination, '/api/index', rewrite.source)
})

test('next.config.mjs forwards the same paths as vercel.json', () => {
  assert.deepEqual([...nextSources()].sort(), [...vercelSources].sort())
})

test('every route of the Go backend is reached on Vercel and locally', () => {
  const routes = webRoutes()
  assert.ok(routes.includes('/api/health') && routes.includes('/api/auth/callback/github'), routes.join(', '))
  for (const route of routes) {
    assert.ok(vercelSources.some(source => covers(source, route)), `${route} is not rewritten in vercel.json`)
  }
})

test('every rewritten path reaches a route of the Go backend', () => {
  const routes = webRoutes()
  for (const source of vercelSources) {
    assert.ok(routes.some(route => covers(source, route)), `${source} matches no route in server/internal/web`)
  }
})
