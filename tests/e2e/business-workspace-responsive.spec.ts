import { resolve } from 'node:path'
import { expect, test, type Page, type Request } from '@playwright/test'

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
      summary: { expiring_authorizations: 2, device_anomalies: 1, pending_tickets: 3, waiting_interventions: 1, stale_batches: 0, expense_renewals_due: 1 },
      expiring_authorizations: [{ id: 1, code_masked: 'BUSI***001', expires_at: new Date(Date.now() + 86400000).toISOString() }],
      device_anomalies: [], pending_tickets: [], stale_batches: [],
      waiting_interventions: [{ batch_id: 1, tool_name: '注册自动处理', account_label_masked: '客***甲', intervention_type: 'captcha', updated_at: new Date().toISOString() }],
      expense_renewals: [{ id: 1, name: '云服务续费', vendor: '云服务商', default_amount: 128, category_name: '服务器/云服务', next_due_on: new Date().toISOString().slice(0, 10), due_state: 'due' }],
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

test('真实随附模板经浏览器 Worker 匹配非首张工作表，八行脱敏且原文不上传', async ({ page }) => {
  await mockControlPlane(page, 'business')
  const tool = {
    ...batchTool,
    id: 'tool_logistics_standard', name: '物流模板演示',
    capability_key: 'logistics_standard', platform_key: 'amazon',
    availability: 'demo_only', demo_scenario_id: 'template-worker-e2e',
  }
  await page.route('**/api/business/bootstrap', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { ...businessUser, tools: [tool] } }),
  }))
  const apiRequests: Request[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request)
  })
  await page.route('**/api/demo/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const data = path === '/api/demo/batches' && request.method() === 'POST'
      ? {
          id: 'template-worker-batch', tool_id: tool.id, row_count: 8, status: 'created',
          items: Array.from({ length: 8 }, (_, index) => ({ item_ref: `template-item-${index + 1}`, status: 'queued', event_seq: 0 })),
        }
      : request.method() === 'GET' ? [] : {}
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
  })
  await page.addInitScript(() => {
    const observation = window as typeof window & { __spreadsheetWorkerReplies: unknown[] }
    observation.__spreadsheetWorkerReplies = []
    // Observe actual native Worker replies without replacing its constructor,
    // file bytes, parser or result. This also detects a silent inline fallback.
    const nativeAddEventListener = Worker.prototype.addEventListener
    const observed = new WeakSet<Worker>()
    Worker.prototype.addEventListener = function (this: Worker, ...args: Parameters<Worker['addEventListener']>) {
      if (!observed.has(this)) {
        observed.add(this)
        nativeAddEventListener.call(this, 'message', (event: Event) => {
          observation.__spreadsheetWorkerReplies.push((event as MessageEvent).data)
        })
      }
      return nativeAddEventListener.apply(this, args)
    }
  })

  await page.setViewportSize({ width: 1365, height: 900 })
  await page.goto('/#/business/workspace', { waitUntil: 'domcontentloaded' })
  expect(await page.evaluate(() => typeof (window as Window & { electronAPI?: unknown }).electronAPI)).toBe('undefined')
  await page.getByRole('button', { name: tool.name }).click()
  const workerStarted = page.waitForEvent('worker')
  const chooserOpened = page.waitForEvent('filechooser')
  await page.getByTestId('business-file-upload').click()
  await (await chooserOpened).setFiles(resolve('resources/templates/B端批量自动化测试数据.xlsx'))
  expect((await workerStarted).url()).toContain('spreadsheet.worker-')

  const expectedLabels = Array.from({ length: 8 }, (_, index) => `模板***${String(index + 1).padStart(2, '0')}`)
  await expect(page.locator('.selected-import')).toContainText('已匹配工作表：物流模板 · 模板 1.0.0')
  await expect(page.locator('.import-result')).toHaveText('8 个演示项')
  await expect(page.locator('.preview-list > div:not(.more-row) > span')).toHaveText(expectedLabels.slice(0, 6))
  await expect(page.locator('.preview-list .more-row')).toHaveText('还有 2 行未展开')
  const replies = await page.evaluate(() => (window as typeof window & { __spreadsheetWorkerReplies: unknown[] }).__spreadsheetWorkerReplies)
  expect(replies).toHaveLength(1)
  expect(replies[0]).toMatchObject({
    ok: true,
    result: {
      fileName: 'B端批量自动化测试数据.xlsx', worksheetName: '物流模板', templateVersion: '1.0.0',
      validCount: 8, errorCount: 0,
      rows: expectedLabels.map(account_label => ({ preview: { account_label } })),
    },
  })

  await page.getByRole('button', { name: '开始批量演示' }).click()
  const runConsole = page.getByTestId('business-run-console')
  await expect(runConsole.locator('tbody tr')).toHaveCount(8)
  await expect(runConsole.locator('.account-cell strong')).toHaveText(expectedLabels)
  await expect(runConsole.locator('.sync-state')).toHaveText('状态已同步')
  const createRequest = apiRequests.find(request => new URL(request.url()).pathname === '/api/demo/batches' && request.method() === 'POST')
  expect(createRequest?.postDataJSON()).toEqual({
    tool_id: tool.id, tool_name: tool.name, platform_key: 'amazon',
    scenario_id: tool.demo_scenario_id, row_count: 8,
  })
  const transferred = apiRequests.map(request => `${request.url()}\n${request.postData() || ''}`).join('\n')
  const rendered = await page.locator('body').innerText()
  for (let index = 1; index <= 8; index += 1) {
    const customerLabel = `模板演示-${String(index).padStart(2, '0')}`
    expect(transferred).not.toContain(customerLabel)
    expect(transferred).not.toContain(`赛训物流模板 ${index}`)
    expect(rendered).not.toContain(customerLabel)
  }
  expect(apiRequests.some(request => new URL(request.url()).pathname.startsWith('/api/business/batches') && request.method() !== 'GET')).toBe(false)
})

test('并发运行总览在桌面尺寸可滚动、可筛选并可关闭详情', async ({ page }, testInfo) => {
  await mockControlPlane(page, 'business')
  const itemIds = Array.from({ length: 8 }, (_, index) => `demo-item-${index + 1}`)
  await page.route('**/api/demo/**', async route => {
    const url = new URL(route.request().url())
    let data: unknown = {}
    if (route.request().method() === 'POST' && url.pathname === '/api/demo/batches') {
      data = {
        id: 'demo-batch-e2e', tool_id: 'tool_register', row_count: itemIds.length, status: 'created',
        items: itemIds.map(item_ref => ({ item_ref, status: 'queued', event_seq: 0 })),
      }
    } else if (route.request().method() === 'GET') {
      data = []
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
  })
  await page.addInitScript(itemIds => {
    const importPreview = {
      importId: 'concurrent-import', fileName: '并发演示.xlsx', validCount: itemIds.length, errorCount: 0, errors: [],
      rows: itemIds.map((itemId, index) => ({ itemId, preview: { account_label: `演示账号 ${index + 1}` } })),
    }
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        runtime: { deviceId: 'e2e-device' },
        demoActivity: { setActive: async () => {} },
        batch: {
          onEvent: () => () => {},
          getSnapshot: async () => ({ status: 'idle', recordKind: 'live', items: [] }),
          loadSampleImport: async () => importPreview,
          remapImportItems: async () => importPreview,
          create: async () => ({
            batchId: 'local-demo-e2e', serverBatchId: 'demo-batch-e2e', status: 'running', recordKind: 'demo', counts: { total: itemIds.length },
            items: itemIds.map((itemId, index) => ({ itemId, accountLabelMasked: `演***${index + 1}`, status: 'pending', browserReady: false })),
          }),
          cancel: async () => ({ status: 'cancelled', items: [] }),
          selectItem: async () => {},
        },
      },
    })
  }, itemIds)

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/#/business/workspace', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '注册自动处理' }).click()
  await page.getByRole('button', { name: /一键载入演示数据/ }).click()
  await page.getByRole('button', { name: '开始批量演示' }).click()

  const console = page.getByTestId('business-run-console')
  await expect(console).toBeVisible()
  await expect(console.getByText('账号执行总览')).toBeVisible()
  await expect(console.locator('tbody tr')).toHaveCount(8)
  await expect(console.getByRole('button', { name: '退出演示' })).toBeInViewport()
  await expectNoOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('run-console-1280x720.png') })

  await console.locator('tbody tr').first().click()
  await expect(page.getByRole('dialog', { name: '账号执行详情' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('run-console-detail-1280x720.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.detail-layer')).not.toHaveClass(/open/)

  await console.getByRole('button', { name: /运行中/ }).click()
  await expect(console.locator('tbody tr')).toHaveCount(8)
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1600, height: 900 }]) {
    await page.setViewportSize(viewport)
    await expect(console.getByRole('button', { name: '退出演示' })).toBeInViewport()
    await expectNoOverflow(page)
    await page.screenshot({ path: testInfo.outputPath(`run-console-${viewport.width}x${viewport.height}.png`) })
  }
})

test('管理员行动中心在 1024 和 768 下保持完整卡片矩阵', async ({ page }) => {
  await mockControlPlane(page, 'super_admin')
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 768 })
    await page.goto('/#/admin/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.summary-card')).toHaveCount(5)
    await expect(page.getByText('工具成功率')).toHaveCount(0)
    await expectNoOverflow(page)
  }
})
