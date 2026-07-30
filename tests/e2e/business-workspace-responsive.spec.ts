import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error(`[pageerror] ${error.message}`))
})

const businessUser = {
  role: 'user', product_type: 'business', business_workspace_enabled: true,
  plan_name: '专业批量版', seat_limit: 5, seat_used: 1,
  entitlements: { batch_execution: true, multi_account_workspace: true, desktop_notification: true, max_batch_rows: 50, max_open_sessions: 6 },
}

const batchTool = {
  id: 'tool_register', name: '注册自动处理', description: '自动完成重复业务操作',
  business_description: '顺序处理多个客户账号', supports_batch: true,
  target_url: 'https://sellercentral.amazon.com/',
  batch_input_schema: [{ key: 'account_label', label: '客户简称', type: 'text', required: true }],
}

async function mockControlPlane(page: Page, role: 'business' | 'consumer' | 'super_admin' = 'business'): Promise<void> {
  const user = role === 'business'
    ? businessUser
    : role === 'super_admin'
      ? { id: 'super-admin-1', staff_id: 'super-admin-1', username: 'acceptance_admin', display_name: '超级管理员', role, status: 'active', force_password_reset: false }
      : { role: 'user', product_type: 'consumer', business_workspace_enabled: false, plan_name: '普通版', entitlements: {} }
  await page.addInitScript(({ user, role }) => {
    const sessionRole = role === 'super_admin' ? 'super_admin' : 'user'
    sessionStorage.setItem('toolbox_auth', JSON.stringify({ token: 'visual-token', role: sessionRole }))
    sessionStorage.setItem('toolbox_token', 'visual-token')
    sessionStorage.setItem('toolbox_role', sessionRole)
    localStorage.setItem('toolbox_user', JSON.stringify(user))
  }, { user, role })
  await page.route('**/api/**', async route => {
    const url = route.request().url()
    let data: unknown = []
    if (url.includes('/api/business/bootstrap')) data = { ...businessUser, tools: [batchTool] }
    else if (url.includes('/api/business/batches')) data = []
    else if (url.includes('/api/auth/me') || url.includes('/api/staff/auth/me')) data = user
    else if (url.includes('/api/tools')) data = [{ ...batchTool, capability_tags: ['自动填报', '页面核验', '结果确认'] }]
    else if (url.includes('/api/admin/action-center')) data = {
      summary: { expiring_authorizations: 2, device_anomalies: 1, pending_tickets: 3, waiting_interventions: 1, stale_batches: 0 },
      expiring_authorizations: [{ id: 1, code_masked: 'BUSI***001', expires_at: new Date(Date.now() + 86400000).toISOString() }],
      device_anomalies: [], pending_tickets: [], stale_batches: [],
      waiting_interventions: [{ batch_id: 1, tool_name: '注册自动处理', account_label_masked: '客***甲', intervention_type: 'captcha', updated_at: new Date().toISOString() }],
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
  })
}

async function expectNoOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
}

for (const width of [1365, 1024, 768]) {
  test(`B端四个路由在 ${width}px 无页面级横向溢出`, async ({ page }) => {
    await mockControlPlane(page, 'business')
    await page.setViewportSize({ width, height: 768 })
    for (const path of ['overview', 'workspace', 'records', 'license']) {
      await page.goto(`/#/business/${path}`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.business-layout')).toBeVisible()
      await expectNoOverflow(page)
    }
  })
}

test('C端即使工具配置支持批量，也不出现批量入口', async ({ page }) => {
  await mockControlPlane(page, 'consumer')
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/#/user/tools', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.toolbox-page')).toBeVisible()
  await expect(page.getByText('批量工作台')).toHaveCount(0)
  await expect(page.getByText('成功率')).toHaveCount(0)
  await expectNoOverflow(page)
})

test('载入演示数据后准备页可滚动到开始按钮', async ({ page }) => {
  await mockControlPlane(page, 'business')
  await page.addInitScript(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        batch: {
          onEvent: () => () => {},
          getSnapshot: async () => ({ status: 'idle', items: [] }),
          loadSampleImport: async () => ({
            importId: 'responsive-import',
            fileName: 'B端批量自动化测试数据.xlsx',
            validCount: 8,
            errorCount: 0,
            rows: Array.from({ length: 8 }, (_, index) => ({
              itemId: `item-${index + 1}`,
              preview: { account_label: `演示项 ${index + 1}` },
            })),
            errors: [],
          }),
        },
      },
    })
  })
  await page.setViewportSize({ width: 1365, height: 720 })
  await page.goto('/#/business/workspace', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '注册自动处理' }).click()
  await page.getByRole('button', { name: /一键载入演示数据/ }).click()

  const workspace = page.getByTestId('business-workspace-page')
  const startButton = page.getByRole('button', { name: '开始批量演示' })
  await expect(startButton).toBeEnabled()
  await expect.poll(() => workspace.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }))).toMatchObject({ overflowY: 'auto' })
  await startButton.scrollIntoViewIfNeeded()
  await expect(startButton).toBeInViewport()
})

test('管理员行动中心在 1024 和 768 下保持完整卡片矩阵', async ({ page }) => {
  await mockControlPlane(page, 'super_admin')
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 768 })
    await page.goto('/#/admin/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.summary-card')).toHaveCount(4)
    await expect(page.getByText('工具成功率')).toHaveCount(0)
    await expectNoOverflow(page)
  }
})
