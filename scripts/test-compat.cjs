// Runs identical black-box cases against the actual Go/Kotlin commands and an explicitly supplied test DB.
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { backendOf, kotlinBackendDir, KOTLIN_BINARY } = require('./dev.cjs')
const { secret, origin, code, verifier, newOwner } = require('../tests/contracts/auth.cjs')

const root = path.join(__dirname, '..')
const args = new Set(process.argv.slice(2))
const connection = process.env.TYPLE_TEST_DATABASE_URL
const children = []
let directory
async function port() {
  const socket = net.createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const value = socket.address().port
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
  return value
}
function start(command, argv, options = {}) {
  const child = spawn(command, argv, { cwd: root, detached: process.platform !== 'win32', ...options })
  const done = new Promise(resolve => {
    child.once('error', error => resolve({ error, code: 1 }))
    child.once('exit', code => resolve({ code: code ?? 1 }))
  })
  children.push({ child, done })
  return { child, done }
}
async function run(command, argv, env = process.env, cwd = root) {
  const { done } = start(command, argv, { env, cwd, stdio: 'inherit' })
  const result = await done
  if (result.code !== 0) throw result.error ?? new Error(`${command} exited with ${result.code}`)
}
async function stop() {
  for (const { child } of children) {
    if (child.exitCode !== null || !child.pid) continue
    try {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
    } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  await Promise.race([Promise.all(children.map(value => value.done)), delay(5000)])
  for (const { child } of children) {
    if (child.exitCode !== null || !child.pid) continue
    try {
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
}
async function main() {
  for (const arg of args) if (!['--matrix', '--android'].includes(arg)) throw new Error(`Unknown option: ${arg}`)
  if (!connection) throw new Error('TYPLE_TEST_DATABASE_URL にマイグレーション済みのテスト専用DBを指定してください。DATABASE_URL にはフォールバックしません。')
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typle-contract-'))
  const backends = args.has('--matrix') ? ['go', 'kotlin'] : [backendOf()]
  const targets = []
  for (const backend of backends) {
    let command
    if (backend === 'go') {
      command = path.join(directory, process.platform === 'win32' ? 'typle-web.exe' : 'typle-web')
      await run('go', ['build', '-o', command, './server/cmd/typle-web'])
    } else {
      const checkout = kotlinBackendDir()
      await run(process.execPath, ['--test', path.join(checkout, 'tests/upstream.test.cjs')],
        { ...process.env, TYPLE_R: root }, checkout)
      await run(path.join(checkout, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), ['--no-daemon', 'installDist'], process.env, checkout)
      command = path.join(checkout, KOTLIN_BINARY + (process.platform === 'win32' ? '.bat' : ''))
    }
    const address = `127.0.0.1:${await port()}`
    const log = path.join(directory, `${backend}.log`)
    const fd = fs.openSync(log, 'w')
    const launched = start(command, ['-addr', address], {
      env: { ...process.env, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_GITHUB_ID: 'contract-test',
        AUTH_GITHUB_SECRET: 'contract-test', DATABASE_URL: connection, LOCAL_DEVELOPMENT_LOGIN: '0', SENTRY_DSN: '' },
      stdio: ['ignore', fd, fd],
    })
    fs.closeSync(fd)
    const target = { name: backend, url: `http://${address}` }
    let ready = false
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      if (launched.child.exitCode !== null) break
      try {
        const response = await fetch(`${target.url}/api/health`, { signal: AbortSignal.timeout(1500) })
        if (response.status === 200) { ready = true; break }
      } catch { /* wait for the command and database connection */ }
      await delay(100)
    }
    if (!ready) throw new Error(`${backend} が起動しませんでした。\n${fs.readFileSync(log, 'utf8')}`)
    targets.push(target)
  }
  const env = { ...process.env, TYPLE_COMPAT_TARGETS: JSON.stringify(targets) }
  await run(process.execPath, ['--test', 'tests/contracts/api.test.cjs'], env)
  if (args.has('--android')) {
    const checkout = path.resolve(root, process.env.TYPLE_ANDROID || '../typle-android')
    const checks = fs.readdirSync(path.join(checkout, 'tests')).filter(name => name.endsWith('.test.cjs'))
      .map(name => path.join(checkout, 'tests', name))
    await run(process.execPath, ['--test', ...checks], { ...process.env, TYPLE_R: root }, checkout)
    // Compile before making the two-minute login code; a cold Gradle cache can take longer than the code's lifetime.
    await run(path.join(checkout, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'),
      ['-p', path.join(checkout, 'core'), '--no-daemon', 'testClasses'], process.env, checkout)
    const { Pool } = require('pg')
    const pool = new Pool({ connectionString: connection })
    // One owner shared by both backends, to exercise Go -> Android -> Kotlin -> Android -> Go.
    const accountId = newOwner()
    const androidTargets = targets.map(target => ({ ...target, accountId, verifier, code: code(accountId),
      oldToken: require('../tests/contracts/auth.cjs').session(accountId, 25 * 3600) }))
    try {
      await run(path.join(checkout, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'),
        ['-p', path.join(checkout, 'core'), '--no-daemon', 'test', '--tests', '*BackendContractTest'],
        { ...env, TYPLE_R: root, TYPLE_COMPAT_TARGETS: JSON.stringify(androidTargets) }, checkout)
    } finally {
      await pool.query('DELETE FROM typle_workspaces WHERE owner_id = $1', [accountId])
      await pool.end()
    }
  }
}
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  if (stopping) return
  stopping = true
  await stop()
  process.exit(signal === 'SIGINT' ? 130 : 143)
})
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
  await stop()
  if (directory) {
    if (process.exitCode) console.error(`バックエンドログ: ${directory}`)
    else fs.rmSync(directory, { recursive: true, force: true })
  }
})
