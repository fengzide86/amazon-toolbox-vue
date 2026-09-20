import { defineConfig } from '@playwright/test'

const port = 4200
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined
const preview = `npm run preview:marketing -- --strictPort`
const command = process.env.PLAYWRIGHT_MARKETING_PREBUILT === '1' || process.env.PLAYWRIGHT_PREBUILT === '1'
  ? preview : `npm run build:marketing && npm run marketing:audit && ${preview}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'marketing-site.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: 'test-results/marketing',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium', headless: true,
    launchOptions: executablePath ? { executablePath } : undefined,
    serviceWorkers: 'block',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command, url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false, timeout: 120_000,
  },
})
