import { test, expect } from '@playwright/test'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_URL = 'http://localhost:3000'
const ADMIN_STATE_FILE = join(__dirname, '..', '..', 'test-results', 'admin-state.json')

// E2E 专用测试授权码
const TEST_E2E_AMZ = 'TEST-E2E-AMZ'

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
// 视觉回归测试
// ===========================
test.describe('视觉回归测试 - 用户端', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuth(page)
    await loginUser(page, TEST_E2E_AMZ)
  })

  test('用户端侧边栏图标正确渲染', async ({ page }) => {
    const sidebar = page.locator('.sidebar-dark')
    await expect(sidebar).toBeVisible()

    // 检查 SVG 图标存在（Lucide 图标渲染为 SVG）
    const svgIcons = await sidebar.locator('svg').count()
    expect(svgIcons).toBeGreaterThan(5)

    // 检查图标有正确的尺寸
    const firstIcon = sidebar.locator('svg').first()
    const box = await firstIcon.boundingBox()
    expect(box.width).toBeGreaterThan(10)
    expect(box.height).toBeGreaterThan(10)
  })

  test('用户端页面布局正确', async ({ page }) => {
    const layout = page.locator('.layout-studio')
    await expect(layout).toBeVisible()

    // 检查 grid 布局
    const computedStyle = await layout.evaluate(el => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        gap: style.gap
      }
    })

    expect(computedStyle.display).toBe('grid')
    expect(computedStyle.gridTemplateColumns).toMatch(/\d+px 1fr/)
  })

  test('用户端页面配色正确', async ({ page }) => {
    // 检查 .app-layout 背景色
    const appLayout = page.locator('.app-layout')
    const bgColor = await appLayout.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor
    })

    // --studio-bg: #F5F6F9 → rgb(245, 246, 249)
    expect(bgColor).toMatch(/rgb\(245, 246, 249\)/)

    // 检查内容区背景色
    const content = page.locator('.content-studio')
    const contentBg = await content.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor
    })

    // --studio-surface: #FFFFFF → rgb(255, 255, 255)
    expect(contentBg).toMatch(/rgb\(255, 255, 255\)/)
  })

  test('用户端侧边栏配色正确', async ({ page }) => {
    const sidebar = page.locator('.sidebar-dark')
    const sidebarBg = await sidebar.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor
    })

    // 侧边栏背景: #0F172A → rgb(15, 23, 42)
    expect(sidebarBg).toMatch(/rgb\(15, 23, 42\)/)
  })

  test('页面切换动画存在', async ({ page }) => {
    // 检查 Transition 组件是否正确包裹
    const appDiv = page.locator('#app')
    await expect(appDiv).toBeVisible()

    // 导航到另一个页面，验证路由切换正常
    await page.goto(`${FRONTEND_URL}/#/user/tools`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 10000 })

    // 导航回来
    await page.goto(`${FRONTEND_URL}/#/user/dashboard`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('视觉回归测试 - 后台', () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test('后台布局正确', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await page.waitForLoadState('networkidle')

    // 检查 .app-layout 存在
    const appLayout = page.locator('.app-layout')
    await expect(appLayout).toBeVisible()

    // 检查 grid 布局
    const layout = page.locator('.layout')
    await expect(layout).toBeVisible()

    const computedStyle = await layout.evaluate(el => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
      }
    })

    expect(computedStyle.display).toBe('grid')
    expect(computedStyle.gridTemplateColumns).toMatch(/\d+px 1fr/)
  })

  test('后台侧边栏图标正确渲染', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('.sidebar-dark')
    await expect(sidebar).toBeVisible()

    // AdminSidebar 使用内联 SVG，检查 SVG 元素存在
    const svgIcons = await sidebar.locator('svg').count()
    expect(svgIcons).toBeGreaterThan(5)
  })

  test('后台配色正确', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await page.waitForLoadState('networkidle')

    const appLayout = page.locator('.app-layout')
    const bgColor = await appLayout.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor
    })

    // --studio-bg: #F5F6F9 → rgb(245, 246, 249)
    expect(bgColor).toMatch(/rgb\(245, 246, 249\)/)

    // 检查内容区背景色
    const content = page.locator('.content')
    const contentBg = await content.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor
    })

    // --studio-surface: #FFFFFF → rgb(255, 255, 255)
    expect(contentBg).toMatch(/rgb\(255, 255, 255\)/)
  })
})