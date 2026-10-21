// Starts the Go backend (typle-web) and `next dev` together. When either one stops, the other is stopped too and this
// script exits with the code of the first. Usage: node scripts/dev.cjs [next dev arguments...]
const { loadEnvConfig } = require('@next/env')
const { spawn, spawnSync } = require('node:child_process')

const GO_MISSING = 'go コマンドが見つかりません。バックエンドの起動に Go 1.25 以上が必要です。https://go.dev/dl/ からインストールしてください。'
const STOP_TIMEOUT_MS = 5000

function exitCode(code, signal) {
  if (code !== null) return code
  return signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1
}

/** Runs typle-web and `next dev <nextArgs>` until one of them ends. */
function startDev(nextArgs = []) {
  loadEnvConfig(process.cwd(), true)
  if (spawnSync('go', ['version'], { stdio: 'ignore' }).error) {
    console.error(GO_MISSING)
    process.exit(1)
  }
  // `go run` starts the server as its own child and does not pass SIGTERM on, so each process gets its own group and
  // signals go to the whole group.
  const children = [
    spawn('go', ['run', './server/cmd/typle-web', '-addr', '127.0.0.1:8081'], { stdio: 'inherit', detached: true }),
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
      console.error(error.code === 'ENOENT' && child === children[0] ? GO_MISSING : error.message)
      running.delete(child)
      finish(1, 'SIGTERM')
    })
    child.on('exit', (status, signal) => {
      running.delete(child)
      finish(exitCode(status, signal), signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM')
    })
  }
}

module.exports = { startDev }
if (require.main === module) startDev(process.argv.slice(2))
