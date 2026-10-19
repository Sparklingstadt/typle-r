const fs = require('node:fs')
const { randomBytes } = require('node:crypto')
const target = '.env.local'
if (fs.existsSync(target)) {
  console.error('.env.local already exists; preserved. Configure it using .env.example.')
  process.exitCode = 1
} else {
  const password = randomBytes(32).toString('hex')
  fs.writeFileSync(target, [
    `POSTGRES_PASSWORD=${password}`,
    `DATABASE_URL=postgresql://typle:${password}@127.0.0.1:5433/typle`,
    `AUTH_SECRET=${randomBytes(32).toString('base64')}`,
    'AUTH_URL=http://localhost:3000',
    'AUTH_GITHUB_ID=',
    'AUTH_GITHUB_SECRET=',
    '',
  ].join('\n'), { mode: 0o600, flag: 'wx' })
  console.log('Created .env.local. Add GitHub OAuth credentials locally; do not commit this file.')
}
