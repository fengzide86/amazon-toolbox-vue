import { defineConfig } from '@playwright/test'

const port = 4173
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined
const webServerCommand = process.env.PLAYWRIGHT_PREBUILT === '1'
  ? `npm run preview -- --host 127.0.0.1 --port ${port}`
  : `npm run build:web && npm run preview -- --host 127.0.0.1 --port ${port}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'internal-acceptance.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: true,
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  reporter: [['list']],
  outputDir: 'test-results/internal-acceptance',
  webServer: {
    command: webServerCommand,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 300_000,
  },
})
