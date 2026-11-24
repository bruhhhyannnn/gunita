import { defineConfig } from '@playwright/test'

// End-to-end tests: `pnpm test:e2e`. They start their own dev server on port
// 3100 with the "e2e" Cloudflare environment (a separate local database, and
// settings from .dev.vars.e2e), plus a fake Claude API on port 8788.
const PORT = 3100
const CI = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: CI ? 2 : 3,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1300, height: 950 },
    trace: CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/mock-anthropic.mjs',
      url: 'http://127.0.0.1:8788/',
      reuseExistingServer: !CI,
    },
    {
      command: `pnpm exec wrangler d1 migrations apply DB --local --env e2e && pnpm exec vite dev --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/login`,
      env: { CLOUDFLARE_ENV: 'e2e' },
      timeout: 180_000,
      reuseExistingServer: !CI,
    },
  ],
})
