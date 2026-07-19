import { expect, test, type Page, type Request as PlaywrightRequest, type Route } from '@playwright/test'
import ExcelJS from 'exceljs'

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
  },
  expiring_authorizations: [],
  device_anomalies: [],
  pending_tickets: [],
  waiting_interventions: [],
  stale_batches: [],
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

function parseJsonBody(request: PlaywrightRequest): Record<string, unknown> {
  const raw = request.postData()
  if (!raw) return {}
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`Expected object JSON body for ${request.url()}`)
  return parsed as Record<string, unknown>
}

test('C 端单工具只进入 Demo，并且不会写真实执行接口或显示真实成功结论', async ({ page }) => {
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
      return wrapped({
        id: 'demo-run-1',
        record_kind: 'demo',
        execution_scope: 'single',
        tool_id: 'demo-register',
        tool_name_snapshot: '注册流程演示',
        platform_key: 'amazon',
        scenario_id: 'register-example',
        status: 'created',
        completed_step_count: 0,
        total_step_count: 6,
        created_at: now,
      })
    }
    if (path === '/api/demo/runs/demo-run-1/finish') {
      return wrapped({
        id: 'demo-run-1',
        record_kind: 'demo',
        execution_scope: 'single',
        tool_id: 'demo-register',
        tool_name_snapshot: '注册流程演示',
        platform_key: 'amazon',
        scenario_id: 'register-example',
        status: 'completed',
        completed_step_count: 6,
        total_step_count: 6,
        simulated_outcome: 'completed_example',
        created_at: now,
        finished_at: now,
      })
    }
    return undefined
  })

  await page.goto('/#/user/tools')
  await expect(page.getByRole('heading', { name: '选择一个工具体验演示' })).toBeVisible()
  await page.getByTestId('tool-card-注册流程演示').click()

  const workspace = page.getByTestId('tool-workspace')
  await expect(workspace).toBeVisible()
  await expect(workspace.getByText('演示模式：不会登录、读取或修改真实店铺数据。')).toBeVisible()
  await expect(workspace.getByText('演示结果不代表真实任务结果')).toBeVisible()
  await expect(workspace.locator('webview')).toHaveCount(0)
  await expect(workspace.getByText('成功率')).toHaveCount(0)
  await expect(workspace.getByText(/预计.*时间/)).toHaveCount(0)

  expect(requestedPaths.some(path => path.startsWith('/api/logs'))).toBe(false)
  expect(requestedPaths.some(path => path.includes('launch-grant'))).toBe(false)
  expect(requestedPaths.some(path => path.startsWith('/api/business/batches'))).toBe(false)
})

test('B 端本地解析 xlsx，只发送行数和工具元数据，原文账号与 Cookie 不离开浏览器', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: '体验批量流程演示' })).toBeVisible()
  await page.getByRole('button', { name: /批量注册流程演示/ }).click()

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('demo')
  sheet.addRow(['account_label', 'password', 'cookie'])
  sheet.addRow(['secret.account@example.com', 'PASSWORD_SHOULD_NEVER_LEAVE', 'COOKIE_SHOULD_NEVER_LEAVE'])
  sheet.addRow(['second.internal@example.com', 'SECOND_PASSWORD_PRIVATE', 'SECOND_COOKIE_PRIVATE'])
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer())

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /选择 .xlsx 演示表格/ }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({
    name: 'internal-demo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsx,
  })

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
  await expect(page.getByText('不访问真实平台')).toBeVisible()
})

const roleExpectations: Array<{
  role: StaffRole
  visible: string[]
  hidden: string[]
  forbiddenPath?: string
}> = [
  {
    role: 'super_admin',
    visible: ['分润管理', '应用更新', '系统设置', '后台账号管理'],
    hidden: [],
  },
  {
    role: 'operator',
    visible: ['订单与套餐', '分润管理', '客服规则管理'],
    hidden: ['应用更新', '系统设置', '后台账号管理'],
    forbiddenPath: '/admin/settings',
  },
  {
    role: 'support',
    visible: ['订单与套餐', '工单管理', '客服规则管理', '公告管理'],
    hidden: ['专业工作台', '分润管理', '应用更新', '系统设置', '后台账号管理'],
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
