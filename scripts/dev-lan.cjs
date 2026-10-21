const { loadEnvConfig } = require('@next/env')
const { startDev } = require('./dev.cjs')
const { isIPv4 } = require('node:net')

loadEnvConfig(process.cwd(), true)
const host = process.env.LOCAL_DEVELOPMENT_LAN_HOST
let url
try { url = new URL(process.env.AUTH_URL) } catch { /* Report invalid configuration below. */ }
const parts = (host ?? '').split('.').map(Number)
const privateAddress = isIPv4(host ?? '') && (parts[0] === 10 ||
  (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
  (parts[0] === 192 && parts[1] === 168))
if (!privateAddress || url?.protocol !== 'http:' || url.hostname !== host) {
  console.error('.env.local の LOCAL_DEVELOPMENT_LAN_HOST と AUTH_URL に同じLAN内IPv4を設定してください。')
  process.exit(1)
}
startDev(['--hostname', host, '--port', url.port || '80'])
