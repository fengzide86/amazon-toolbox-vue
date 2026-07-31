import { expect, test, type Page, type Request as PlaywrightRequest, type Route } from '@playwright/test'

type StaffRole = 'super_admin' | 'operator' | 'support'
type SessionRole = StaffRole | 'user'

interface MockResponse {
  body: unknown
  status?: number
}

type ApiResponder = (request: PlaywrightRequest, path: string) => MockResponse | undefined | Promise<MockResponse | undefined>

const API_ORIGIN = 'http://127.0.0.1:4173'
const now = '2026-07-18T08:00:00.000Z'

const actionCenter = {
  summary: {
    expiring_authorizations: 0,
    device_anomalies: 0,
    pending_tickets: 0,
    waiting_interventions: 0,
    stale_batches: 0,
    expense_renewals_due: 0,
  },
  expiring_authorizations: [],
  device_anomalies: [],
  pending_tickets: [],
  waiting_interventions: [],
  stale_batches: [],
  expense_renewals: [],
}

function json(route: Route, response: MockResponse): Promise<void> {
  return route.fulfill({
    status: response.status ?? 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(response.body),
  })
}

function wrapped(data: unknown): MockResponse {
  return { body: { success: true, data } }
}

async function installSession(
  page: Page,
  role: SessionRole,
  userOverrides: Record<string, unknown> = {},
): Promise<void> {
  const isStaff = role !== 'user'
  const user = isStaff
    ? {
        id: `${role}-1`,
        staff_id: `${role}-1`,
        username: `${role}_acceptance`,
        display_name: role === 'super_admin' ? '超级管理员' : role === 'operator' ? '运营' : '客服',
        role,
        status: 'active',
        force_password_reset: false,
        ...userOverrides,
      }
    : {
        id: 'internal-user-1',
        name: '内部测试用户',
        role: 'user',
        product_type: 'consumer',
        business_workspace_enabled: false,
        entitlements: {},
        ...userOverrides,
      }

  await page.addInitScript(({ apiOrigin, sessionRole, storedUser }) => {
    const token = `acceptance-${sessionRole}-token`
    sessionStorage.setItem('toolbox_auth', JSON.stringify({ token, role: sessionRole, auth_code: sessionRole === 'user' ? 'INTERNAL-DEMO' : undefined }))
    sessionStorage.setItem('toolbox_token', token)
    sessionStorage.setItem('toolbox_role', sessionRole)
    localStorage.setItem('toolbox_user', JSON.stringify(storedUser))
    localStorage.setItem('toolbox_api_base', apiOrigin)
    localStorage.setItem('toolbox_control_api_base', apiOrigin)
    localStorage.setItem('toolbox_current_platform', 'amazon')
    localStorage.setItem('toolbox_admin_platform', 'all')
  }, { apiOrigin: API_ORIGIN, sessionRole: role, storedUser: user })
}

async function installApi(page: Page, responder?: ApiResponder): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const custom = await responder?.(request, url.pathname)
    if (custom) {
      await json(route, custom)
      return
    }

    if (url.pathname === '/api/tools/platforms') {
      await json(route, wrapped([{ key: 'amazon', name: '亚马逊', short_name: '亚马逊', status: 'available' }]))
      return
    }
    if (url.pathname === '/api/announcements/feed') {
      await json(route, wrapped([]))
      return
    }
    if (url.pathname === '/api/admin/action-center') {
      await json(route, wrapped(actionCenter))
      return
    }
    if (url.pathname === '/api/orders' || url.pathname === '/api/plans' || url.pathname === '/api/updates/releases') {
      await json(route, wrapped([]))
      return
    }
    if (url.pathname === '/api/ai-chat/history') {
      await json(route, wrapped({ items: [], total: 0, page: 1, page_size: 20 }))
      return
    }
    await json(route, request.method() === 'GET' ? wrapped([]) : { body: { success: true, data: {} } })
  })
}

async function installBatchDesktopBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const maskedRows = [
      { itemId: 'local-alpha', preview: { account_label: 'se***@example.com' } },
      { itemId: 'local-beta', preview: { account_label: 'se***@example.com' } },
    ]
    let remappedRows = maskedRows
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        batch: {
          onEvent: () => () => undefined,
          getSnapshot: async () => null,
          selectImportFile: async () => ({
            importId: 'desktop-import-1',
            fileName: 'internal-demo.xlsx',
            validCount: 2,
            errorCount: 0,
            worksheetName: 'demo',
            rows: maskedRows,
            errors: [],
          }),
          remapImportItems: async (payload: { itemIds?: string[] }) => {
            remappedRows = (payload.itemIds || []).map((itemId, index) => ({
              itemId,
              preview: maskedRows[index]?.preview || { account_label: '' },
            }))
            return {
              importId: 'desktop-import-1-remapped',
              fileName: 'internal-demo.xlsx',
              validCount: remappedRows.length,
              errorCount: 0,
              worksheetName: 'demo',
              rows: remappedRows,
              errors: [],
            }
          },
          create: async (payload: Record<string, unknown>) => ({
            batchId: payload.batchId,
            serverBatchId: payload.serverBatchId,
            tool: payload.tool,
            status: 'running',
            recordKind: payload.recordKind,
            counts: { total: remappedRows.length, pending: remappedRows.length, running: 0, waiting: 0, completed: 0, failed: 0 },
            items: remappedRows.map(row => ({
              itemId: row.itemId,
              accountLabelMasked: String(row.preview.account_label || ''),
              status: 'pending',
              browserReady: false,
            })),
          }),
        },
      },
    })
  })
}

function parseJsonBody(request: PlaywrightRequest): Record<string, unknown> {
  const raw = request.postData()
  if (!raw) return {}
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`Expected object JSON body for ${request.url()}`)
  return parsed as Record<string, unknown>
}

test('C 端单工具即使记录接口失败也进入 Demo，并且不会写真实执行接口或显示真实成功结论', async ({ page }) => {
  await installSession(page, 'user')
  const requestedPaths: string[] = []
  await installApi(page, (request, path) => {
    requestedPaths.push(path)
    if (path === '/api/tools') {
      return wrapped([{
        id: 'demo-register',
        name: '注册流程演示',
        description: '展示模拟注册流程',
        category: 'automation',
        platform_key: 'amazon',
        release_status: 'available',
        availability: 'demo_only',
        demo_scenario_id: 'register-example',
        supports_demo_single: true,
        supports_live_single: false,
      }])
    }
    if (path === '/api/demo/runs' && request.method() === 'POST') {
      return { status: 503, body: { detail: 'demo telemetry unavailable' } }
    }
    return undefined
  })

  await page.goto('/#/user/tools')
  await expect(page.getByTestId('tools-page')).toBeVisible()
  await page.getByTestId('tool-card-注册流程演示').click()

  const workspace = page.getByTestId('tool-workspace')
  await expect(workspace).toBeVisible()
  await expect(workspace.getByTestId('execution-scope-note')).toContainText('数据只存在本地沙盒')
  await expect(workspace.getByTestId('result-boundary')).toHaveText('结果只代表本地沙盒操作成功')
  await expect(workspace.locator('webview')).toHaveCount(0)
  await expect(workspace.getByText('成功率')).toHaveCount(0)
  await expect(workspace.getByText(/预计.*时间/)).toHaveCount(0)

  expect(requestedPaths.some(path => path.startsWith('/api/logs'))).toBe(false)
  expect(requestedPaths.some(path => path.includes('launch-grant'))).toBe(false)
  expect(requestedPaths.some(path => path.startsWith('/api/business/batches'))).toBe(false)
})

test('消息中心抽屉位于页面根层，不会被工具卡片覆盖', async ({ page }) => {
  await installSession(page, 'user')
  await installApi(page, (_request, path) => {
    if (path === '/api/tools') {
      return wrapped([
        {
          id: 'demo-register',
          name: '注册流程演示',
          description: '展示模拟注册流程',
          category: 'automation',
          platform_key: 'amazon',
          release_status: 'available',
          supports_demo_single: true,
        },
        {
          id: 'demo-listing',
          name: '上品流程演示',
          description: '展示模拟上品流程',
          category: 'automation',
          platform_key: 'amazon',
          release_status: 'available',
          supports_demo_single: true,
        },
      ])
    }
    if (path === '/api/announcements/feed') {
      return wrapped([{
        id: 1,
        title: '1.7.9 更新说明',
        content: '消息中心层级修复验收',
        type: 'update',
        audience: 'all',
        category: 'update',
        severity: 'info',
        presentation: 'banner',
        app_version: '1.7.9',
        priority: 10,
        published_at: now,
        revision: 1,
        created_at: now,
        is_read: false,
        is_dismissed: false,
      }])
    }
    return undefined
  })

  await page.setViewportSize({ width: 1365, height: 900 })
  await page.goto('/#/user/tools')
  await page.getByRole('button', { name: /消息中心/ }).click()

  const layer = page.locator('body > .drawer-layer')
  const drawer = layer.locator('.message-drawer')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('1.7.9 更新说明')).toBeVisible()
  expect(await drawer.evaluate(element => getComputedStyle(element).position)).toBe('absolute')
  expect(await layer.evaluate(element => Number.parseInt(getComputedStyle(element).zIndex, 10))).toBeGreaterThan(1000)

  const box = await drawer.boundingBox()
  expect(box).not.toBeNull()
  const topElementIsDrawer = await page.evaluate(({ x, y }) => {
    return Boolean(document.elementFromPoint(x, y)?.closest('.message-drawer'))
  }, { x: Math.round((box?.x || 0) + 30), y: Math.round((box?.y || 0) + 360) })
  expect(topElementIsDrawer).toBe(true)
})

test('B 端接收桌面端脱敏预览，只发送行数和工具元数据，原文账号与 Cookie 不离开渲染进程', async ({ page }) => {
  await installSession(page, 'user', {
    product_type: 'business',
    business_workspace_enabled: true,
    entitlements: {
      batch_execution: true,
      multi_account_workspace: true,
      max_batch_rows: 50,
      max_open_sessions: 4,
    },
  })
  await installBatchDesktopBridge(page)

  const demoBatchRequests: PlaywrightRequest[] = []
  const itemRefs = ['item_ref_alpha', 'item_ref_beta']
  await installApi(page, (request, path) => {
    if (path === '/api/business/bootstrap') {
      return wrapped({
        entitlements: { max_batch_rows: 50, max_open_sessions: 4 },
        tools: [{
          id: 'batch-demo',
          name: '批量注册流程演示',
          platform_key: 'amazon',
          availability: 'demo_only',
          demo_scenario_id: 'batch-register-example',
          supports_demo_batch: true,
          supports_live_batch: false,
          batch_input_schema: [{ key: 'account_label', label: '客户简称', type: 'text', required: true, sensitive: true }],
        }],
      })
    }
    if (path.startsWith('/api/demo/batches')) {
      demoBatchRequests.push(request)
      if (path === '/api/demo/batches' && request.method() === 'POST') {
        return wrapped({
          id: 'demo-batch-1',
          record_kind: 'demo',
          execution_scope: 'batch',
          tool_id: 'batch-demo',
          tool_name_snapshot: '批量注册流程演示',
          scenario_id: 'batch-register-example',
          status: 'created',
          row_count: 2,
          queued_count: 2,
          playing_count: 0,
          played_count: 0,
          skipped_count: 0,
          error_count: 0,
          items: itemRefs.map(item_ref => ({ item_ref, status: 'queued', event_seq: 0 })),
          created_at: now,
        })
      }
      if (path === '/api/demo/batches/demo-batch-1/finish') {
        return wrapped({
          id: 'demo-batch-1',
          record_kind: 'demo',
          execution_scope: 'batch',
          tool_id: 'batch-demo',
          tool_name_snapshot: '批量注册流程演示',
          scenario_id: 'batch-register-example',
          status: 'completed',
          row_count: 2,
          queued_count: 0,
          playing_count: 0,
          played_count: 2,
          skipped_count: 0,
          error_count: 0,
          items: itemRefs.map(item_ref => ({ item_ref, status: 'played', simulated_outcome: 'completed_example', event_seq: 2 })),
          created_at: now,
          finished_at: now,
        })
      }
      return wrapped({})
    }
    return undefined
  })

  await page.goto('/#/business/workspace')
  await expect(page.getByTestId('business-workspace-page')).toBeVisible()
  await page.getByRole('button', { name: /批量注册流程演示/ }).click()

  await page.getByTestId('business-file-upload').click()

  await expect(page.getByText('se***@example.com').first()).toBeVisible()
  await expect(page.getByText('secret.account@example.com')).toHaveCount(0)
  await expect(page.getByText('原始单元格、账号和 Cookie 均不会上传')).toBeVisible()
  await page.getByRole('button', { name: '开始批量演示' }).click()
  await expect.poll(() => demoBatchRequests.length).toBeGreaterThan(0)

  const createRequest = demoBatchRequests.find(request => new URL(request.url()).pathname === '/api/demo/batches' && request.method() === 'POST')
  expect(createRequest, '应创建独立 Demo 批次').toBeTruthy()
  const createBody = parseJsonBody(createRequest!)
  expect(Object.keys(createBody).sort()).toEqual(['platform_key', 'row_count', 'scenario_id', 'tool_id', 'tool_name'])
  expect(createBody).toEqual({
    tool_id: 'batch-demo',
    tool_name: '批量注册流程演示',
    platform_key: 'amazon',
    scenario_id: 'batch-register-example',
    row_count: 2,
  })

  const serializedRequests = demoBatchRequests.map(request => request.postData() || '').join('\n')
  for (const secret of [
    'secret.account@example.com',
    'second.internal@example.com',
    'PASSWORD_SHOULD_NEVER_LEAVE',
    'SECOND_PASSWORD_PRIVATE',
    'COOKIE_SHOULD_NEVER_LEAVE',
    'SECOND_COOKIE_PRIVATE',
  ]) expect(serializedRequests).not.toContain(secret)
  expect(demoBatchRequests.some(request => new URL(request.url()).pathname.startsWith('/api/business/batches'))).toBe(false)
  await expect(page.getByText(/演示工具运行本地沙盒/)).toBeVisible()
})

const roleExpectations: Array<{
  role: StaffRole
  visible: string[]
  hidden: string[]
  forbiddenPath?: string
}> = [
  {
    role: 'super_admin',
    visible: ['分润管理', '公账支出', '应用更新', '系统设置', '后台账号管理'],
    hidden: [],
  },
  {
    role: 'operator',
    visible: ['订单与套餐', '分润管理', '公账支出', '客服规则管理'],
    hidden: ['应用更新', '系统设置', '后台账号管理'],
    forbiddenPath: '/admin/settings',
  },
  {
    role: 'support',
    visible: ['订单与套餐', '工单管理', '客服规则管理', '公告管理'],
    hidden: ['专业工作台', '分润管理', '公账支出', '应用更新', '系统设置', '后台账号管理'],
    forbiddenPath: '/admin/profit',
  },
]

for (const expectation of roleExpectations) {
  test(`${expectation.role} 的后台路由守卫与侧栏权限一致`, async ({ page }) => {
    await installSession(page, expectation.role)
    await installApi(page)
    await page.goto('/#/admin/dashboard')
    const sidebar = page.getByRole('complementary', { name: '管理员导航' })
    await expect(sidebar).toBeVisible()
    for (const label of expectation.visible) await expect(sidebar.getByText(label, { exact: true })).toBeVisible()
    for (const label of expectation.hidden) await expect(sidebar.getByText(label, { exact: true })).toHaveCount(0)

    if (expectation.forbiddenPath) {
      await page.goto(`/#${expectation.forbiddenPath}`)
      await expect(page).toHaveURL(/#\/admin\/dashboard\?access=role-required$/)
    }

    if (expectation.role === 'support') {
      await page.goto('/#/admin/orders')
      await expect(page.getByRole('heading', { name: '订单管理' })).toBeVisible()
      await expect(page.getByText('创建新订单', { exact: true })).toHaveCount(0)
    }
  })
}

test('公账支出完成记账、创建续费并确认生成实际流水', async ({ page }) => {
  await installSession(page, 'super_admin')
  const categories = [
    { id: 1, code: 'development', name: '开发', status: 'active', sort_order: 10, is_system: true },
    { id: 2, code: 'tool_membership', name: '工具会员', status: 'active', sort_order: 30, is_system: true },
  ]
  const expenses: Array<Record<string, unknown>> = []
  const renewals: Array<Record<string, unknown>> = []
  const expenseFrom = (body: Record<string, unknown>, id: number, renewal?: Record<string, unknown>) => ({
    id,
    amount: String(Number(body.amount).toFixed(2)),
    currency: 'CNY',
    expense_date: body.expense_date,
    title: body.title,
    category_id: body.category_id,
    category_name: categories.find(item => item.id === Number(body.category_id))?.name || '其他',
    payee: body.payee || null,
    note: body.note || null,
    status: 'active',
    renewal_id: renewal?.id || null,
    renewal_name: renewal?.name || null,
    renewal_due_on: renewal?.next_due_on || null,
    created_by_name: '超级管理员',
    created_at: now,
    updated_at: now,
    attachments: [],
  })

  await installApi(page, (request, path) => {
    const method = request.method()
    if (path === '/api/expenses/categories' && method === 'GET') return wrapped(categories)
    if (path === '/api/expenses/summary' && method === 'GET') {
      const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
      return wrapped({
        month: '2026-07', total: total.toFixed(2), previous_total: '0.00', change_percent: total ? '100.00' : '0.00',
        count: expenses.length, upcoming_renewals: renewals.length, overdue_renewals: 0,
        trend: [{ month: '2026-07', total: total.toFixed(2) }],
        categories: total ? [{ category_id: 1, category_name: '开发', total: total.toFixed(2), percentage: '100.00' }] : [],
      })
    }
    if (path === '/api/expenses' && method === 'GET') return { body: { success: true, data: expenses, total: expenses.length, page: 1, page_size: 20, total_pages: expenses.length ? 1 : 0 } }
    if (path === '/api/expenses' && method === 'POST') {
      const created = expenseFrom(parseJsonBody(request), expenses.length + 1)
      expenses.unshift(created)
      return { status: 201, body: { success: true, data: created } }
    }
    if (path === '/api/expenses/renewals' && method === 'GET') return { body: { success: true, data: renewals, total: renewals.length, page: 1, page_size: 20, total_pages: renewals.length ? 1 : 0 } }
    if (path === '/api/expenses/renewals' && method === 'POST') {
      const body = parseJsonBody(request)
      const created = {
        id: renewals.length + 1,
        ...body,
        default_amount: String(Number(body.default_amount).toFixed(2)),
        category_name: categories.find(item => item.id === Number(body.category_id))?.name || '工具会员',
        status: 'active',
        due_state: 'upcoming',
        occurrences: [],
      }
      renewals.unshift(created)
      return { status: 201, body: { success: true, data: created } }
    }
    const confirmMatch = path.match(/^\/api\/expenses\/renewals\/(\d+)\/confirm$/)
    if (confirmMatch && method === 'POST') {
      const renewal = renewals.find(item => Number(item.id) === Number(confirmMatch[1]))!
      const body = parseJsonBody(request)
      const expense = expenseFrom({
        amount: body.amount || renewal.default_amount,
        expense_date: body.expense_date,
        title: renewal.name,
        category_id: renewal.category_id,
        payee: renewal.vendor,
        note: body.note,
      }, expenses.length + 1, renewal)
      expenses.unshift(expense)
      renewal.next_due_on = '2026-08-31'
      renewal.due_state = 'scheduled'
      renewal.occurrences = [{ id: 1, renewal_id: renewal.id, due_on: body.due_on, status: 'paid', expense_id: expense.id }]
      return wrapped({ renewal, expense })
    }
    const renewalDetail = path.match(/^\/api\/expenses\/renewals\/(\d+)$/)
    if (renewalDetail && method === 'GET') return wrapped(renewals.find(item => Number(item.id) === Number(renewalDetail[1])))
    return undefined
  })

  await page.goto('/#/admin/expenses')
  await expect(page.getByRole('heading', { name: '公账支出' })).toBeVisible()
  await page.getByRole('button', { name: '记一笔支出' }).click()
  let drawer = page.locator('.el-drawer').last()
  await drawer.locator('.el-input-number input').fill('320.50')
  await drawer.getByPlaceholder('例如：7 月阿里云服务器').fill('测试云服务器')
  await drawer.getByRole('button', { name: '确认入账' }).click()
  await expect(page.getByText('测试云服务器')).toBeVisible()
  await expect(page.getByText('¥320.50', { exact: true }).first()).toBeVisible()

  await page.getByRole('tab', { name: /续费项目/ }).click()
  await page.getByRole('button', { name: '新建续费项目' }).click()
  drawer = page.locator('.el-drawer').last()
  await drawer.getByPlaceholder('例如：Figma Professional').fill('设计工具会员')
  await drawer.locator('.el-input-number input').first().fill('99.00')
  await drawer.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByText('设计工具会员', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: '确认续费' }).first().click()
  drawer = page.locator('.el-drawer').last()
  await drawer.locator('.el-input-number input').fill('118.00')
  await drawer.getByRole('button', { name: '确认续费并入账' }).click()
  await expect(page.getByText('¥438.50', { exact: true }).first()).toBeVisible()

  await page.getByRole('tab', { name: /支出流水/ }).click()
  await expect(page.getByText('设计工具会员', { exact: true }).first()).toBeVisible()
  expect(expenses).toHaveLength(2)
  expect(renewals[0]?.next_due_on).toBe('2026-08-31')
})

test('订单人工确认收款走独立动作接口，随后可见分润，退款保留终态', async ({ page }) => {
  await installSession(page, 'super_admin')
  let status: 'pending' | 'paid' | 'refunded' = 'pending'
  const actionCalls: Array<{ method: string; path: string; body: string | null }> = []
  const order = () => ({
    id: 1,
    order_no: 'INTERNAL-ORDER-001',
    plan_id: 11,
    amount: 100,
    channel: 'internal',
    responsible: '运营 A',
    status,
    refund_amount: status === 'refunded' ? 100 : 0,
    created_at: now,
  })
  await installApi(page, (request, path) => {
    if (path === '/api/orders' && request.method() === 'GET') return wrapped([order()])
    if (path === '/api/plans/admin') return wrapped([{
      id: 11,
      name: '内部验证套餐',
      price: 100,
      duration_days: 30,
      status: 'active',
      product_type: 'consumer',
      entitlements: {},
    }])
    if (path === '/api/orders/1/mark-paid' && request.method() === 'POST') {
      actionCalls.push({ method: request.method(), path, body: request.postData() })
      status = 'paid'
      return wrapped(order())
    }
    if (path === '/api/orders/1/refund' && request.method() === 'POST') {
      actionCalls.push({ method: request.method(), path, body: request.postData() })
      status = 'refunded'
      return wrapped(order())
    }
    if (path === '/api/profit/summary') {
      const active = status === 'paid' ? 100 : 0
      const reversed = status === 'refunded' ? 100 : 0
      return wrapped({
        total_tech: active * 0.3,
        total_market: active * 0.25,
        total_product: active * 0.15,
        total_service: active * 0.15,
        total_coordination: active * 0.1,
        total_record: active * 0.05,
        grand_total: active,
        active: { grand_total: active },
        reversed: { grand_total: reversed },
      })
    }
    if (path === '/api/profit/policy') {
      return wrapped({
        version: 1,
        ratios: { tech: 0.3, market: 0.25, product: 0.15, service: 0.15, coordination: 0.1, record: 0.05 },
      })
    }
    return undefined
  })

  await page.goto('/#/admin/orders')
  await expect(page.getByText('INTERNAL-ORDER-001')).toBeVisible()
  await expect(page.getByText('初始状态', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '标记已收款' }).click()
  const paidDialog = page.locator('.el-message-box')
  await expect(paidDialog.getByText('确认订单已人工收款？')).toBeVisible()
  await paidDialog.getByRole('button', { name: '确认已收款' }).click()
  await expect.poll(() => actionCalls.map(call => call.path)).toContain('/api/orders/1/mark-paid')
  expect(actionCalls[0]).toEqual({ method: 'POST', path: '/api/orders/1/mark-paid', body: '{}' })
  await expect(page.getByRole('row', { name: /INTERNAL-ORDER-001.*已收款/ })).toBeVisible()

  await page.goto('/#/admin/profit')
  await expect(page.getByText('¥100.00', { exact: true })).toBeVisible()
  await expect(page.locator('.profit-summary')).toBeVisible()
  await expect(page.locator('.distribution-item')).toHaveCount(6)
  await expect(page.locator('.stat-icon')).toHaveCount(0)
  for (const width of [1365, 1024, 768, 520]) {
    await page.setViewportSize({ width, height: 800 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    const rowCounts = await page.locator('.distribution-item').evaluateAll((items) => {
      const tops = items.map(item => Math.round(item.getBoundingClientRect().top))
      return [...new Set(tops)].map(top => tops.filter(value => value === top).length)
    })
    if (width === 1365) expect(rowCounts).toEqual([3, 3])
    else if (width === 520) expect(rowCounts).toEqual([1, 1, 1, 1, 1, 1])
    else expect(rowCounts).toEqual([2, 2, 2])
  }
  await page.setViewportSize({ width: 1365, height: 800 })

  await page.goto('/#/admin/orders')
  await page.getByRole('button', { name: '退款' }).click()
  const dialog = page.locator('.el-message-box')
  await expect(dialog.getByText('确认退款', { exact: true })).toBeVisible()
  await dialog.getByPlaceholder('请填写至少 2 个字的原因').fill('内部验收退款')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => actionCalls.map(call => call.path)).toContain('/api/orders/1/refund')
  expect(JSON.parse(actionCalls.at(-1)?.body || '{}')).toEqual({ reason: '内部验收退款' })
  await expect(page.getByRole('row', { name: /INTERNAL-ORDER-001.*已退款/ })).toBeVisible()
})

test('知识库和客服按区域降级，分页元数据与规则预览保持可用', async ({ page }) => {
  await installSession(page, 'super_admin')
  await installApi(page, (request, path) => {
    if (path === '/api/knowledge') {
      const item = {
        id: 801,
        category: '授权说明',
        title: '如何更换授权设备',
        content: '先解绑旧设备，再登录新设备。',
        keywords: ['换设备'],
        priority: 'high',
        status: 'active',
        view_count: 3,
      }
      return { body: { data: [item], items: [item], total: 21, page: 1, page_size: 20 } }
    }
    if (path === '/api/knowledge/categories') return { body: { success: true, data: { unexpected: true } } }
    if (path === '/api/knowledge/stats') return wrapped({ total: 21, active: 20, categories: 4 })
    if (path === '/api/ai-chat/admin/config') {
      return { body: {
        welcome_message: '欢迎咨询工具规则',
        suggested_questions: '["如何换设备"]',
        transfer_keywords: '["退款","投诉"]',
        max_unmatched: '3',
      } }
    }
    if (path === '/api/ai-chat/admin/sessions') return { body: { success: true, data: { unexpected: true } } }
    if (path === '/api/ai-chat/admin/stats') {
      return { body: { total_sessions: 4, today_sessions: 1, resolve_rate: 50, transfer_rate: 25 } }
    }
    if (path === '/api/ai-chat/admin/debug' && request.method() === 'POST') {
      return { body: {
        reply: '请先解绑旧设备，再登录新设备。',
        answer_mode: 'faq',
        ai_used: false,
        knowledge_refs: [],
        fallback_reason: null,
        should_transfer: false,
        diagnostics: { total_ms: 2 },
      } }
    }
    return undefined
  })

  await page.goto('/#/admin/knowledge')
  await expect(page.getByText('如何更换授权设备')).toBeVisible()
  await expect(page.getByText('共 21 条')).toBeVisible()
  await expect(page.getByText('知识库统计暂时无法加载')).toBeVisible()

  await page.goto('/#/admin/ai-chat')
  await expect(page.locator('.panel-left textarea').first()).toHaveValue('欢迎咨询工具规则')
  await expect(page.locator('.stat-value-mini').first()).toHaveText('4')
  await expect(page.getByText('分页响应缺少数据列表')).toBeVisible()
  await page.getByPlaceholder('输入测试问题...').fill('如何换设备')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('请先解绑旧设备，再登录新设备。')).toBeVisible()
  await expect(page.getByText('转人工建议：否')).toBeVisible()
})

test('规则客服覆盖 FAQ、fallback，并通过转人工接口创建工单', async ({ page }) => {
  await installSession(page, 'user')
  const asked: string[] = []
  let transferred = false
  await installApi(page, (request, path) => {
    if (path === '/api/ai-chat/session' && request.method() === 'POST') {
      return { body: { session_id: 'session-1', status: 'active', welcome_message: '您好，这是规则式工具帮助。' } }
    }
    if (path === '/api/ai-chat/session/session-1/message') {
      const body = parseJsonBody(request)
      const message = String(body.message || '')
      asked.push(message)
      if (message === '授权码无法使用') {
        return { body: {
          session_id: 'session-1',
          reply: '请先核对授权码状态和设备席位。',
          answer_mode: 'faq',
          ai_used: false,
          knowledge_refs: [{ id: 7, title: '授权码排查', category: '授权', score: 1 }],
        } }
      }
      return { body: {
        session_id: 'session-1',
        reply: '知识库暂未匹配到答案，您可以转人工继续处理。',
        answer_mode: 'fallback',
        ai_used: false,
        knowledge_refs: [],
      } }
    }
    if (path === '/api/ai-chat/session/session-1/transfer') {
      transferred = true
      return { body: { success: true, ticket_id: 'ticket-1' } }
    }
    return undefined
  })

  await page.goto('/#/user/ai-chat')
  const input = page.getByLabel('描述你的问题')
  await expect(input).toBeEnabled()

  await input.fill('授权码无法使用')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('请先核对授权码状态和设备席位。')).toBeVisible()
  await expect(page.getByText('授权码排查')).toBeVisible()

  await input.fill('这是一个完全未知的内部问题')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('知识库暂未匹配到答案，您可以转人工继续处理。')).toBeVisible()
  expect(asked).toEqual(['授权码无法使用', '这是一个完全未知的内部问题'])

  await page.getByRole('button', { name: '转人工客服' }).click()
  const dialog = page.locator('.el-message-box')
  await dialog.getByRole('button', { name: '创建工单' }).click()
  await expect.poll(() => transferred).toBe(true)
  await expect(page.getByText('已为您创建工单，人工客服将尽快与您联系').last()).toBeVisible()
})

test('更新发布页仅超级管理员可达，并反馈从待发布到已发布的状态', async ({ page }) => {
  await installSession(page, 'super_admin')
  let published = false
  const publishCalls: string[] = []
  const release = () => ({
    version: '1.8.0',
    status: published ? 'published' : 'staged',
    files: [
      { name: 'AmazonToolbox Setup 1.8.0.exe', size: 1024, sha512: 'exe-sha512' },
      { name: 'AmazonToolbox Setup 1.8.0.exe.blockmap', size: 512, sha512: 'blockmap-sha512' },
      { name: 'latest.yml', size: 256, sha512: 'manifest-sha512' },
    ],
    staged_at: now,
    published_at: published ? now : undefined,
    is_latest: published,
  })
  await installApi(page, (request, path) => {
    if (path === '/api/updates/releases' && request.method() === 'GET') return wrapped([release()])
    if (path === '/api/updates/releases/1.8.0/publish' && request.method() === 'POST') {
      publishCalls.push(path)
      published = true
      return wrapped(release())
    }
    return undefined
  })

  await page.goto('/#/admin/updates')
  await expect(page.getByRole('heading', { name: '应用更新' })).toBeVisible()
  await expect(page.getByText('待发布', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '确认发布' }).click()
  const dialog = page.locator('.el-message-box')
  await dialog.getByRole('button', { name: '确认发布' }).click()
  await expect.poll(() => publishCalls).toEqual(['/api/updates/releases/1.8.0/publish'])
  await expect(page.getByText('已发布', { exact: true })).toBeVisible()
  await expect(page.getByText('客户端可检查到', { exact: true })).toBeVisible()
})
