import { defineConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 60000,
  expect: { timeout: 15000 },
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure' },
  reporter: [['list']],
  webServer: {
    env: { AUTH_SECRET: 'typle-e2e-only-not-a-production-secret-32-bytes', AUTH_URL: 'http://127.0.0.1:3101' },
    command: 'node node_modules/next/dist/bin/next start -p 3101 -H 127.0.0.1',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
