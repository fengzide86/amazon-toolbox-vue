import { defineConfig } from '@playwright/test'
import { join } from 'node:path'

const runtime = process.env.KST_REAL_E2E_DIR
const baseURL = process.env.KST_REAL_E2E_BASE_URL
if (!runtime || !baseURL || new URL(baseURL).hostname !== '127.0.0.1') {
  throw new Error('Use node scripts/run-real-e2e.mjs; real acceptance must own an isolated loopback backend')
}
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'real-control-plane.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: join(runtime, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: join(runtime, 'results.json') }]],
  use: {
    baseURL,
    headless: true,
    actionTimeout: 15_000,
    viewport: { width: 1440, height: 900 },
    launchOptions: executablePath ? { executablePath } : undefined,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
