import { test, expect, type Locator, type Page } from '@playwright/test'
import type { UpdateSnapshot, UpdateStatus } from '../../src/shared/ipc/update-contract'

const FRONTEND_URL = 'http://localhost:3000'

// E2E 专用测试授权码
const TEST_E2E_AMZ = 'TEST-E2E-AMZ'
const TEST_DEVICE_ID = 'playwright-e2e-device'
let cachedAdminSession: Record<string, string> | null = null

// Helper: clear auth state
async function clearAuth(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/#/user/login`)
  await page.waitForLoadState('networkidle')
  await page.evaluate((deviceId) => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('toolbox_device_id', deviceId)
    localStorage.setItem('toolbox_device_name', 'Playwright E2E')
  }, TEST_DEVICE_ID)
}

// Helper: login as user with auth code
async function loginUser(page: Page, authCode: string): Promise<void> {
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
    return sessionStorage.getItem('toolbox_auth') !== null
  }, { timeout: 10000 })

  await expect(page.getByTestId('user-layout')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 10000 })
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/#/admin/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  if (cachedAdminSession) {
    await page.evaluate(entries => {
      Object.entries(entries).forEach(([key, value]) => sessionStorage.setItem(key, value))
    }, cachedAdminSession)
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await expect(page.locator('.studio-admin-sidebar')).toBeVisible({ timeout: 15000 })
    return
  }
  await page.reload()
  await page.locator('#adminPassword').fill('admin123')
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/api/auth/admin-login') && response.request().method() === 'POST',
    { timeout: 15000 }
  )
  await page.locator('button[type="submit"]').click()
  expect((await responsePromise).status()).toBe(200)
  await expect(page.locator('.studio-admin-sidebar')).toBeVisible({ timeout: 15000 })
  cachedAdminSession = await page.evaluate(() => Object.fromEntries(
    Array.from({ length: sessionStorage.length }, (_, index): [string, string] | null => {
      const key = sessionStorage.key(index)
      return key ? [key, sessionStorage.getItem(key) || ''] : null
    }).filter((entry): entry is [string, string] => entry !== null)
  ))
}

async function distinctRowCounts(locator: Locator): Promise<number[]> {
  const tops = await locator.evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().top)))
  return [...new Set(tops)].map(top => tops.filter(value => value === top).length)
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

async function installAvailableUpdateBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const snapshot: UpdateSnapshot = {
      status: 'available', currentVersion: '1.7.2', availableVersion: '1.8.0',
      releaseNotes: ['提升界面可读性'], downloadBytes: 52_428_800, canRestart: false,
    }
    const withStatus = (status: UpdateStatus, percent?: number): UpdateSnapshot => ({ ...snapshot, status, percent })
    window.electronAPI = {
      ...(window.electronAPI || {}),
      updates: {
        getState: async () => snapshot,
        check: async () => snapshot,
        startDownload: async () => withStatus('downloading', 0),
        cancelDownload: async () => withStatus('cancelled'),
        install: async () => snapshot,
        defer: async () => snapshot,
        onState: () => () => {},
      },
    }
  })
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
    const sidebar = page.locator('.studio-user-sidebar')
    await expect(sidebar).toBeVisible()

    // 检查 SVG 图标存在（Lucide 图标渲染为 SVG）
    const svgIcons = await sidebar.locator('svg').count()
    expect(svgIcons).toBeGreaterThan(5)

    // 检查图标有正确的尺寸
    const firstIcon = sidebar.locator('svg').first()
    const box = await firstIcon.boundingBox()
    if (!box) throw new Error('Sidebar icon has no bounding box')
    expect(box.width).toBeGreaterThan(10)
    expect(box.height).toBeGreaterThan(10)
  })

  test('用户端页面布局正确', async ({ page }) => {
    const layout = page.locator('.main-container')
    await expect(layout).toBeVisible()

    // 检查 flex 布局（全高骨架设计）
    const computedStyle = await layout.evaluate(el => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        flexDirection: style.flexDirection
      }
    })

    expect(computedStyle.display).toBe('flex')
    expect(computedStyle.flexDirection).toBe('row')
  })

  test('用户端页面配色正确', async ({ page }) => {
    // 检查 .app-layout 背景色
    const appLayout = page.locator('.app-layout')
    const bgColor = await appLayout.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor
    })

    // --color-canvas: #F4F5F7
    expect(bgColor).toMatch(/rgb\(244, 245, 247\)/)

    await expect(page.locator('.toolbox-page')).toBeVisible()
    await expect(page.getByText('选择一个工具开始')).toBeVisible()
    await expect(page.getByText('成功率')).toHaveCount(0)
  })

  test('用户端侧边栏配色正确', async ({ page }) => {
    const sidebar = page.locator('.studio-user-sidebar')
    const sidebarBg = await sidebar.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor
    })

    // 明亮表面侧边栏
    expect(sidebarBg).toMatch(/rgba?\(252, 252, 253/)
  })

  test('页面切换动画存在', async ({ page }) => {
    // 检查 Transition 组件是否正确包裹
    const appDiv = page.locator('#app[data-v-app]')
    await expect(appDiv).toBeVisible()

    // 导航到另一个页面，验证路由切换正常
    await page.goto(`${FRONTEND_URL}/#/user/tools`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 10000 })

    // 切换到执行记录
    await page.goto(`${FRONTEND_URL}/#/user/logs`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 10000 })
  })

  test('套餐卡片按数量使用完整平衡栅格', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 768 })
    await page.goto(`${FRONTEND_URL}/#/user/plans`)
    const cards = page.locator('.plan-card')
    await expect(cards.first()).toBeVisible({ timeout: 10000 })
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    const compactRows = await distinctRowCounts(cards)
    if (count === 4) expect(compactRows).toEqual([2, 2])
    else expect(compactRows).toEqual([count])
    await expectNoPageOverflow(page)

    await page.setViewportSize({ width: 700, height: 768 })
    expect(await distinctRowCounts(cards)).toEqual(Array(count).fill(1))
    await expectNoPageOverflow(page)
  })
})

test.describe('视觉回归测试 - 登录响应式', () => {
  test.beforeEach(async ({ page }) => clearAuth(page))

  test('1024 宽度保持左右布局且六项能力同一行', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto(`${FRONTEND_URL}/#/user/login`)

    const brandBox = await page.locator('.login-brand').boundingBox()
    const formBox = await page.locator('.login-form-section').boundingBox()
    if (!brandBox || !formBox) throw new Error('Login layout is not visible')
    expect(Math.abs(brandBox.y - formBox.y)).toBeLessThanOrEqual(1)
    expect(formBox.x).toBeGreaterThan(brandBox.x + brandBox.width - 2)
    expect(await distinctRowCounts(page.locator('.feature-tag'))).toEqual([6])
    await expectNoPageOverflow(page)
  })

  test('窄屏能力标签形成完整 3x2 矩阵', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 768 })
    await page.goto(`${FRONTEND_URL}/#/user/login`)
    expect(await distinctRowCounts(page.locator('.feature-tag'))).toEqual([3, 3])
    await expectNoPageOverflow(page)
  })

  test('授权成功后立即导航并播放跨路由光轨', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/user/login`)
    await page.evaluate(() => {
      window.__routeTrackObserved = false
      const observer = new MutationObserver(() => {
        if (document.querySelector('.route-track')) window.__routeTrackObserved = true
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })
    })
    await page.locator('#authCode').fill(TEST_E2E_AMZ)
    await page.locator('button[type="submit"]').click()
    await expect.poll(() => page.evaluate(() => window.__routeTrackObserved), { timeout: 3000 }).toBe(true)
    await expect(page.getByTestId('user-layout')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('视觉回归测试 - 后台', () => {
  test.beforeEach(async ({ page }) => loginAdmin(page))

  test('后台布局正确', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await page.waitForLoadState('networkidle')

    // 检查 .app-layout 存在
    const appLayout = page.locator('.app-layout')
    await expect(appLayout).toBeVisible()

    // 检查 flex 布局（全高骨架设计）
    const layout = page.locator('.layout')
    await expect(layout).toBeVisible()

    const computedStyle = await layout.evaluate(el => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        flexDirection: style.flexDirection
      }
    })

    expect(computedStyle.display).toBe('flex')
    expect(computedStyle.flexDirection).toBe('row')
  })

  test('后台侧边栏图标正确渲染', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('.studio-admin-sidebar')
    await expect(sidebar).toBeVisible()

    // AdminSidebar 使用 Lucide 图标，检查 SVG 元素存在
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

    // --color-canvas: #F4F5F7
    expect(bgColor).toMatch(/rgb\(244, 245, 247\)/)
  })

  test('知识库统计卡使用 4列到2x2 的完整栅格', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto(`${FRONTEND_URL}/#/admin/knowledge`)
    await expect(page.locator('.knowledge-stats .stat-card')).toHaveCount(4)
    expect(await distinctRowCounts(page.locator('.knowledge-stats .stat-card'))).toEqual([4])
    await expectNoPageOverflow(page)

    await page.setViewportSize({ width: 768, height: 768 })
    expect(await distinctRowCounts(page.locator('.knowledge-stats .stat-card'))).toEqual([2, 2])
    await expectNoPageOverflow(page)
  })

  test('后台关键路由在紧凑宽度没有页面级横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 768 })
    for (const route of ['authcodes', 'orders', 'users', 'feedback', 'announcements', 'knowledge']) {
      await page.goto(`${FRONTEND_URL}/#/admin/${route}`)
      await page.waitForLoadState('networkidle')
      await expectNoPageOverflow(page)
    }
  })
})

test.describe('更新交互与可读性回归', () => {
  test('登录页永远不渲染更新入口、横幅或浮层', async ({ page }) => {
    await installAvailableUpdateBridge(page)
    await clearAuth(page)
    await page.goto(`${FRONTEND_URL}/#/user/login`)
    await expect(page.locator('.update-status-entry')).toHaveCount(0)
    await expect(page.locator('.update-notice')).toHaveCount(0)
    await expect(page.locator('.update-drawer')).toHaveCount(0)
  })

  test('Header 三档宽度不重叠且交互文字不小于 14px', async ({ page }) => {
    await installAvailableUpdateBridge(page)
    await loginAdmin(page)
    for (const width of [1365, 1024, 768]) {
      await page.setViewportSize({ width, height: 768 })
      await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
      await expect(page.locator('.update-status-entry')).toBeVisible()
      const overlap = await page.evaluate(() => {
        const update = document.querySelector('.update-status-entry')?.getBoundingClientRect()
        const account = document.querySelector('.avatar-wrapper')?.getBoundingClientRect()
        if (!update || !account) return 0
        return Math.max(0, Math.min(update.right, account.right) - Math.max(update.left, account.left))
          * Math.max(0, Math.min(update.bottom, account.bottom) - Math.max(update.top, account.top))
      })
      expect(overlap).toBe(0)
      const undersizedControls = await page.evaluate(() => [...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')]
        .filter(element => element instanceof HTMLElement && element.offsetParent !== null)
        .filter(element => Number.parseFloat(getComputedStyle(element).fontSize) < 14)
        .map(element => element.textContent?.trim() || element.getAttribute('aria-label')))
      expect(undersizedControls).toEqual([])
      await expectNoPageOverflow(page)
    }
  })

  test('更新详情是真正的非模态抽屉', async ({ page }) => {
    await installAvailableUpdateBridge(page)
    await loginAdmin(page)
    await page.goto(`${FRONTEND_URL}/#/admin/dashboard`)
    await page.locator('.update-status-entry').click()
    const drawer = page.locator('.update-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer).not.toHaveAttribute('aria-modal')
    await expect(page.locator('.update-drawer-layer')).toHaveCSS('pointer-events', 'none')
    await expect(drawer).toHaveCSS('pointer-events', 'auto')
  })
})
