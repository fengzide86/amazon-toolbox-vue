import { defineConfig } from '@playwright/test'

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined
const webServerCommand = process.env.PLAYWRIGHT_PREBUILT === '1'
  ? 'npm run preview -- --host 127.0.0.1 --port 3000'
  : 'npm run build:desktop && npm run preview -- --host 127.0.0.1 --port 3000'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'premium-visual-capture.spec.ts',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
    screenshot: 'only-on-failure',
  },
  reporter: [['list']],
  outputDir: 'test-results/premium-capture',
  webServer: {
    command: webServerCommand,
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
