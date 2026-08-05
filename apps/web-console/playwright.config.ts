import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4176',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command:
        'env PORT=3100 NODE_ENV=test pnpm --filter @fushi/api-server start',
      url: 'http://127.0.0.1:3100/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        'env FUSHI_API_PROXY=http://127.0.0.1:3100 pnpm dev --host 127.0.0.1 --port 4176',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
