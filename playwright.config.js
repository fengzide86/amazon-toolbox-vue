import { defineConfig } from '@playwright/test'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 0,
  globalSetup: join(__dirname, 'tests', 'e2e', 'global-setup.js'),
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'on',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results/artifacts',
})
