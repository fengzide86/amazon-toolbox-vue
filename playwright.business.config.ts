import { defineConfig } from '@playwright/test'

const webServerCommand = process.env.PLAYWRIGHT_PREBUILT === '1'
  ? 'npm run preview -- --host 127.0.0.1 --port 3000'
  : 'npm run build:web && npm run preview -- --host 127.0.0.1 --port 3000'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'business-workspace-responsive.spec.ts',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    screenshot: 'only-on-failure',
  },
  reporter: [['list']],
  outputDir: 'test-results/business-responsive',
  webServer: {
    command: webServerCommand,
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 300000,
  },
})
