// Starts the backend (typle-web) and `next dev` together. When either one stops, the other is stopped too and this
// script exits with the code of the first. The backend is the Go one (server/cmd/typle-web), or with TYPLE_BACKEND=kotlin
// the Kotlin one (the typle-kotlin-backend repository), which answers the same. Usage: node scripts/dev.cjs [next dev
// arguments...]
const { loadEnvConfig } = require('@next/env')
const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')

const GO_MISSING = 'go コマンドが見つかりません。バックエンドの起動に Go 1.25 以上が必要です。https://go.dev/dl/ からインストールしてください。'
const JAVA_MISSING = 'java コマンドが見つかりません。Kotlin のバックエンドに JDK 21 が必要です。https://adoptium.net/ からインストールし、JAVA_HOME をそこに向けてください。'
// What `gradlew installDist` builds in a typle-kotlin-backend checkout.
const KOTLIN_BINARY = 'build/install/typle-web/bin/typle-web'
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
 * The typle-kotlin-backend checkout TYPLE_KOTLIN_BACKEND names, relative to this repository's root, or the one beside
 * this repository when it is not set.
 */
function kotlinBackendDir(value = process.env.TYPLE_KOTLIN_BACKEND) {
  return path.resolve(__dirname, '..', value || '../typle-kotlin-backend')
}

/**
 * The major version in the output of `java -version`: 21 for 'openjdk version "21.0.2"', 8 for '"1.8.0_402"', or null.
 */
function javaMajorVersion(output) {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(output)
  if (!match) return null
  return match[1] === '1' ? Number(match[2]) : Number(match[1])
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
  // gradlew and the start script use JAVA_HOME when it is set, and java from PATH otherwise. The build (Gradle 8.14 with a
  // Java 21 toolchain, which it does not download) needs JDK 21 exactly: Gradle 8.14 does not run on Java 25.
  const java = process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java'
  const check = spawnSync(java, ['-version'], { encoding: 'utf8' })
  if (check.error) {
    console.error(JAVA_MISSING)
    process.exit(1)
  }
  const major = javaMajorVersion(`${check.stderr}${check.stdout}`)
  if (major !== 21) {
    console.error(`Kotlin のバックエンドのビルドに JDK 21 が必要です（${java} は ${major ?? '版が分からない'} です）。JAVA_HOME を JDK 21 にしてください。`)
    process.exit(1)
  }
  const dir = kotlinBackendDir()
  const build = spawnSync(path.join(dir, 'gradlew'), ['-p', dir, '--quiet', 'installDist'], { stdio: 'inherit' })
  if (build.error?.code === 'ENOENT') {
    console.error(`${dir} に typle-kotlin-backend が見つかりません。https://github.com/Sparklingstadt/typle-kotlin-backend をそこに clone するか、TYPLE_KOTLIN_BACKEND にその場所を指定してください。`)
    process.exit(1)
  }
  if (build.status !== 0) process.exit(build.status || 1)
  return spawn(path.join(dir, KOTLIN_BINARY), ['-addr', address], { stdio: 'inherit', detached: true })
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
      const missing = backend === 'go' ? GO_MISSING : `${path.join(kotlinBackendDir(), KOTLIN_BINARY)} が見つかりません。typle-kotlin-backend の gradlew installDist を確かめてください。`
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

module.exports = { startDev, webAddress, backendOf, kotlinBackendDir, javaMajorVersion, KOTLIN_BINARY }
if (require.main === module) startDev(process.argv.slice(2))
