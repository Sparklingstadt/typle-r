import { test, expect } from '@playwright/test'

// next.config.mjs sends these with every page, and the Go backend (server/internal/web) with every API response, because
// next.config.mjs headers do not apply to the Go functions on Vercel. Locally /api/workspace is the Go backend's answer.
for (const path of ['/home', '/api/workspace']) {
  test(`${path} cannot be framed by another site`, async ({ request }) => {
    const headers = (await request.get(path)).headers()
    expect(headers['content-security-policy']).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'")
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })
}
