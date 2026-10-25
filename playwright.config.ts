import { defineConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
import { kotlinBackendDir, KOTLIN_BINARY } from './scripts/dev.cjs'
import path from 'node:path'
loadEnvConfig(process.cwd())

// TYPLE_BACKEND=kotlin runs the same tests against the Kotlin backend (the typle-kotlin-backend checkout at
// TYPLE_KOTLIN_BACKEND, by default ../typle-kotlin-backend), which must be built first with its gradlew installDist.
const backend = process.env.TYPLE_BACKEND === 'kotlin'
  ? `${JSON.stringify(path.join(kotlinBackendDir(), KOTLIN_BINARY))} -addr 127.0.0.1:8081`
  : 'go run ./server/cmd/typle-web -addr 127.0.0.1:8081'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 60000,
  expect: { timeout: 15000 },
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure' },
  reporter: [['list']],
  // The app's backend is the Go server; Next.js serves the pages and (next.config.mjs rewrites) forwards /api/workspace,
  // /api/health and /api/auth/* to it at TYPLE_WEB_URL (default http://127.0.0.1:8081).
  webServer: [
    {
      // go run compiles first, which can take a while on a cold cache.
      command: backend,
      env: {
        AUTH_SECRET: 'typle-e2e-only-not-a-production-secret-32-bytes',
        AUTH_URL: 'http://127.0.0.1:3101',
        AUTH_GITHUB_ID: 'e2e',
        AUTH_GITHUB_SECRET: 'e2e',
        ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
      },
      url: 'http://127.0.0.1:8081/api/health',
      reuseExistingServer: false,
      timeout: 180000,
    },
    {
      env: { AUTH_SECRET: 'typle-e2e-only-not-a-production-secret-32-bytes', AUTH_URL: 'http://127.0.0.1:3101' },
      command: 'node node_modules/next/dist/bin/next start -p 3101 -H 127.0.0.1',
      url: 'http://127.0.0.1:3101',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
})
