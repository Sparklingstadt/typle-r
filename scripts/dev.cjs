// Starts the backend (typle-web) and `next dev` together. When either one stops, the other is stopped too and this
// script exits with the code of the first. The backend is the Go one (server/cmd/typle-web), or with TYPLE_BACKEND=kotlin
// the Kotlin one (server-kotlin), which answers the same. Usage: node scripts/dev.cjs [next dev arguments...]
const { loadEnvConfig } = require('@next/env')
const { spawn, spawnSync } = require('node:child_process')

const GO_MISSING = 'go コマンドが見つかりません。バックエンドの起動に Go 1.25 以上が必要です。https://go.dev/dl/ からインストールしてください。'
const JAVA_MISSING = 'java コマンドが見つかりません。Kotlin のバックエンドに JDK 21 以上が必要です。https://adoptium.net/ からインストールしてください。'
// What `server-kotlin/gradlew installDist` builds.
const KOTLIN_BINARY = 'server-kotlin/build/install/typle-web/bin/typle-web'
const STOP_TIMEOUT_MS = 5000
const DEFAULT_WEB_ADDRESS = '127.0.0.1:8081'

function exitCode(code, signal) {
  if (code !== null) return code
  return signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1
}

/**
 * The address typle-web listens on: the host and port of TYPLE_WEB_URL, which is where next.config.mjs forwards to, or
 * 127.0.0.1:8081 when it is not set. Throws when it is not an http URL: typle-web speaks plain HTTP only, so with https
 * next.config.mjs would forward to a TLS port that nothing serves.
 */
function webAddress(url = process.env.TYPLE_WEB_URL) {
  if (!url) return DEFAULT_WEB_ADDRESS
  let parsed
  try { parsed = new URL(url) } catch { parsed = null }
  if (parsed?.protocol === 'https:') {
    throw new Error(`TYPLE_WEB_URL (${url}) に https は使えません。バックエンド（typle-web）は HTTP だけで待ち受けます。http:// の URL にしてください。例: http://${DEFAULT_WEB_ADDRESS}`)
  }
  if (!parsed || parsed.protocol !== 'http:' || !parsed.hostname) {
    throw new Error(`TYPLE_WEB_URL (${url}) は http の URL ではありません。例: http://${DEFAULT_WEB_ADDRESS}`)
  }
  return `${parsed.hostname}:${parsed.port || '80'}`
}

/** The backend TYPLE_BACKEND names: go (the default) or kotlin. Throws for anything else. */
function backendOf(value = process.env.TYPLE_BACKEND) {
  if (!value || value === 'go') return 'go'
  if (value === 'kotlin') return 'kotlin'
  throw new Error(`TYPLE_BACKEND (${value}) は go か kotlin にしてください。`)
}

/**
 * The backend's process: `go run` for Go; for Kotlin the start script, built first with installDist. Exits when what it
 * needs is missing or the build fails.
 */
function startBackend(backend, address) {
  if (backend === 'go') {
    if (spawnSync('go', ['version'], { stdio: 'ignore' }).error) {
      console.error(GO_MISSING)
      process.exit(1)
    }
    return spawn('go', ['run', './server/cmd/typle-web', '-addr', address], { stdio: 'inherit', detached: true })
  }
  if (spawnSync('java', ['-version'], { stdio: 'ignore' }).error) {
    console.error(JAVA_MISSING)
    process.exit(1)
  }
  const build = spawnSync('server-kotlin/gradlew', ['-p', 'server-kotlin', '--quiet', 'installDist'], { stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status || 1)
  return spawn(KOTLIN_BINARY, ['-addr', address], { stdio: 'inherit', detached: true })
}

/** Runs typle-web and `next dev <nextArgs>` until one of them ends. */
function startDev(nextArgs = []) {
  loadEnvConfig(process.cwd(), true)
  let address
  let backend
  try {
    address = webAddress()
    backend = backendOf()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
  // `go run` starts the server as its own child and does not pass SIGTERM on, so each process gets its own group and
  // signals go to the whole group.
  const children = [
    startBackend(backend, address),
    spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', ...nextArgs], { stdio: 'inherit', detached: true }),
  ]
  const running = new Set(children)
  let code
  const signalAll = signal => {
    for (const child of running) {
      try { process.kill(-child.pid, signal) } catch { /* Already gone. */ }
    }
  }
  const finish = (first, signal) => {
    if (code === undefined) code = first
    if (running.size === 0) process.exit(code)
    signalAll(signal)
    setTimeout(() => { signalAll('SIGKILL') }, STOP_TIMEOUT_MS).unref()
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => finish(exitCode(null, signal), signal))
  for (const child of children) {
    child.on('error', error => {
      const missing = backend === 'go' ? GO_MISSING : `${KOTLIN_BINARY} が見つかりません。server-kotlin/gradlew -p server-kotlin installDist を確かめてください。`
      console.error(error.code === 'ENOENT' && child === children[0] ? missing : error.message)
      running.delete(child)
      finish(1, 'SIGTERM')
    })
    child.on('exit', (status, signal) => {
      running.delete(child)
      finish(exitCode(status, signal), signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM')
    })
  }
}

module.exports = { startDev, webAddress, backendOf, KOTLIN_BINARY }
if (require.main === module) startDev(process.argv.slice(2))
