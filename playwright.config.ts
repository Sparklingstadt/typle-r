import { defineConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Every core by default (Playwright's own default is half of them): the tests run on the developer's machine since
  // v2.38.1, where npm run verify waits for them. TYPLE_E2E_WORKERS sets another number or share, such as 4 or 50%.
  workers: process.env.TYPLE_E2E_WORKERS || '100%',
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
      command: 'go run ./server/cmd/typle-web -addr 127.0.0.1:8081',
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
