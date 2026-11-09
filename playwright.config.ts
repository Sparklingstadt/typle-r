import { defineConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

/** Playwright takes a number of workers or a share of the cores ('50%'); the variable is a string either way. */
function e2eWorkers(value: string | undefined): number | string {
  if (!value) return 6
  if (/^\d+%$/.test(value)) return value
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1) throw new Error(`TYPLE_E2E_WORKERS must be a whole number or a share such as 50%, got ${value}`)
  return count
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Every test shares one next start and one Go server, so more browsers stop paying off long before the cores run
  // out: on a 14-core Mac (2026-11-10) the suite took about 63 s with 4 workers, 56 s with 5 or 6, 61 s with 7
  // (Playwright's default, half of the cores), 72 s with 10 and 88 s with 14. TYPLE_E2E_WORKERS sets another number or
  // share, such as 4 or 50%.
  workers: e2eWorkers(process.env.TYPLE_E2E_WORKERS),
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
