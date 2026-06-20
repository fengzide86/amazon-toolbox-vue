import { test, expect } from '@playwright/test'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_URL = 'http://localhost:3000'
const ADMIN_STATE_FILE = join(__dirname, '..', '..', 'test-results', 'admin-state.json')

// E2E 专用测试授权码（由 backend/test_data_e2e.py 创建）
const TEST_E2E_AMZ = 'TEST-E2E-AMZ'
const TEST_E2E_AE = 'TEST-E2E-AE'

// Helper: clear auth state
async function clearAuth(page) {
  await page.goto(`${FRONTEND_URL}/#/user/login`)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => {
    localStorage.clear()
  })
}

// Helper: login as user with auth code
async function loginUser(page, authCode) {
  await page.goto(`${FRONTEND_URL}/#/user/login`)
  await page.waitForLoadState('networkidle')

  const authInput = page.locator('#authCode')
  await authInput.fill(authCode)

  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/verify') && resp.request().method() === 'POST',
    { timeout: 15000 }
  )

  await page.locator('button[type="submit"]').click()
  const resp = await loginResponsePromise
  expect(resp.status()).toBe(200)

  await page.waitForFunction(() => {
    return localStorage.getItem('toolbox_auth') !== null
  }, { timeout: 10000 })

  await expect(page.getByTestId('user-layout')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 10000 })
}

// ===========================
// 用户端测试（每个用例独立登录）
// ===========================
test.describe('用户端 AMZ 验收', () => {
  test('AMZ 登录并验证首页和工具箱', async ({ page }) => {
    await clearAuth(page)
    await loginUser(page, TEST_E2E_AMZ)

    await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-results/screenshots/user-amz-dashboard.png', fullPage: true })
    await expect(page.getByTestId('platform-switcher')).toBeVisible({ timeout: 5000 })

    // 视觉检查：侧边栏图标渲染
    const sidebar = page.locator('.sidebar-dark')
    await expect(sidebar).toBeVisible()
    const svgIcons = await sidebar.locator('svg').count()
    expect(svgIcons).toBeGreaterThan(5)

    // 视觉检查：布局正确
    const layout = page.locator('.layout-studio')
    const computedStyle = await layout.evaluate(el => {
      const style = window.getComputedStyle(el)
      return { display: style.display, gridTemplateColumns: style.gridTemplateColumns }
    })
    expect(computedStyle.display).toBe('grid')
    expect(computedStyle.gridTemplateColumns).toMatch(/\d+px 1fr/)

    // 视觉检查：配色正确
    const appLayoutBg = await page.locator('.app-layout').evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )
    expect(appLayoutBg).toMatch(/rgb\(245, 246, 249\)/)

    await page.goto(`${FRONTEND_URL}/#/user/tools`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.tool-card', { hasText: '物流模板标准版' })).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: 'test-results/screenshots/user-amz-tools.png', fullPage: true })
  })
})

test.describe('用户端 AE 验收', () => {
  test('AE 登录并验证工具箱', async ({ page }) => {
    await clearAuth(page)
    await loginUser(page, TEST_E2E_AE)

    await page.goto(`${FRONTEND_URL}/#/user/tools`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.tool-card', { hasText: '物流模板标准版' })).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: 'test-results/screenshots/user-ae-tools.png', fullPage: true })
  })
})

test.describe('FAQ 页面验收', () => {
  test('FAQ 页面加载', async ({ page }) => {
    await clearAuth(page)
    await loginUser(page, TEST_E2E_AMZ)

    await page.goto(`${FRONTEND_URL}/#/user/faq`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-results/screenshots/user-faq.png', fullPage: true })
  })
})

test.describe('工单提交验收', () => {
  test('工单页面加载', async ({ page }) => {
    await clearAuth(page)
    await loginUser(page, TEST_E2E_AMZ)

    await page.goto(`${FRONTEND_URL}/#/user/logs`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-results/screenshots/user-feedback-submit.png', fullPage: true })
  })
})

test.describe('用户端平台切换验收', () => {
  test('用户端平台切换按钮点击有效', async ({ page }) => {
    await clearAuth(page)
    await loginUser(page, TEST_E2E_AMZ)

    // 等待平台切换器可见
    const platformSwitcher = page.getByTestId('platform-switcher')
    await expect(platformSwitcher).toBeVisible({ timeout: 5000 })

    // 获取当前选中的平台按钮
    const activeBtn = platformSwitcher.locator('button.active')
    const activeText = await activeBtn.textContent()
    console.log(`当前选中平台：${activeText}`)

    // 点击另一个平台按钮
    const buttons = platformSwitcher.locator('button.platform-btn:not(.disabled)')
    const buttonCount = await buttons.count()
    
    if (buttonCount > 1) {
      // 点击第一个非当前选中的按钮
      for (let i = 0; i < buttonCount; i++) {
        const btn = buttons.nth(i)
        const btnText = await btn.textContent()
        if (btnText !== activeText) {
          await btn.click()
          await page.waitForTimeout(500)
          
          // 验证按钮状态已切换
          const newActiveBtn = platformSwitcher.locator('button.active')
          const newActiveText = await newActiveBtn.textContent()
          console.log(`切换后平台：${newActiveText}`)
          
          // 验证 localStorage 已更新
          const storedPlatform = await page.evaluate(() => localStorage.getItem('toolbox_current_platform'))
          console.log(`localStorage 中的平台：${storedPlatform}`)
          
          break
        }
      }
    }

    await page.screenshot({ path: 'test-results/screenshots/user-platform-switch.png', fullPage: true })
  })
})

// ===========================
// 后台测试（复用 globalSetup 保存的 admin 登录态）
// ===========================
test.describe.configure({ mode: 'serial' })

test.describe('后台 admin 登录验收', () => {
  // 复用 globalSetup 中保存的 admin 登录态
  test.use({ storageState: ADMIN_STATE_FILE })

  test('admin 登录并进入后台', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.content')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('platform-switcher')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-results/screenshots/admin-dashboard.png', fullPage: true })
  })

  test('后台平台切换 all/amazon/aliexpress', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await page.waitForLoadState('networkidle')

    const platformSwitcher = page.getByTestId('platform-switcher')
    await expect(platformSwitcher).toBeVisible({ timeout: 5000 })

    const allBtn = platformSwitcher.locator('button', { hasText: '全部平台' })
    if (await allBtn.isVisible()) { await allBtn.click(); await page.waitForTimeout(500) }

    const amzBtn = platformSwitcher.locator('button', { hasText: '亚马逊' })
    if (await amzBtn.isVisible()) { await amzBtn.click(); await page.waitForTimeout(500) }

    const aeBtn = platformSwitcher.locator('button', { hasText: '速卖通' })
    if (await aeBtn.isVisible()) { await aeBtn.click(); await page.waitForTimeout(500) }

    await expect(page.locator('.content')).toBeVisible({ timeout: 5000 })
  })

  test('后台 Feedback 页面加载', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/feedback`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.content')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-results/screenshots/admin-feedback.png', fullPage: true })
  })

  test('后台 Knowledge 页面加载', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/knowledge`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.content')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-results/screenshots/admin-knowledge.png', fullPage: true })
  })

  test('后台授权码页面加载', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/authcodes`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.content')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-results/screenshots/admin-auth-code-detail.png', fullPage: true })
  })
})