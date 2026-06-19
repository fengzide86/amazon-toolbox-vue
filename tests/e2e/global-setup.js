import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_URL = 'http://localhost:3000'
const ADMIN_STATE_FILE = join(__dirname, '..', '..', 'test-results', 'admin-state.json')

export default async function globalSetup() {
  // Ensure directory exists
  mkdirSync(join(__dirname, '..', '..', 'test-results'), { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${FRONTEND_URL}/#/admin/login`)
  await page.waitForLoadState('networkidle')

  const passwordInput = page.locator('#adminPassword')
  await passwordInput.fill('admin123')

  await page.locator('button[type="submit"]').click()
  await page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/admin-login') && resp.request().method() === 'POST',
    { timeout: 15000 }
  )

  await page.waitForURL(/admin\/dashboard/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')

  const storageState = await context.storageState()
  writeFileSync(ADMIN_STATE_FILE, JSON.stringify(storageState))

  await context.close()
  await browser.close()
}