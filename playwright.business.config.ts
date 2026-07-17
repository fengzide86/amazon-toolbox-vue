import { defineConfig } from '@playwright/test'

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
    command: 'npm run build:desktop && npm run preview -- --host 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 300000,
  },
})
