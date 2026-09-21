import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const runtime = process.env.KST_REAL_E2E_DIR!
const credentials = JSON.parse(readFileSync(join(runtime, 'credentials.json'), 'utf8')) as {
  consumer: string; business: string; business_cancel: string; staff_username: string; staff_password: string
  agent_a_username: string; agent_a_password: string; agent_b_username: string; agent_b_password: string
  agency_a_id: number; agency_b_id: number
}

interface DatabaseSnapshot {
  runs: Array<{ status: string; completed_step_count: number; total_step_count: number }>
  batches: Array<{ id: string; status: string; row_count: number; queued_count: number; playing_count: number; played_count: number; skipped_count: number; error_count: number }>
  items: Array<{ batch_id: string; status: string; simulated_outcome: string | null }>
  expenses: Array<{ title: string; amount: number; status: string; renewal_id: number | null }>
  occurrences: Array<{ status: string; expense_id: number | null }>
  attachments: Array<{ original_name: string; size_bytes: number }>
  authorizations: Array<{ status: string }>
  live_run_count: number; live_batch_count: number; device_count: number
}

function database(): DatabaseSnapshot {
  return JSON.parse(execFileSync(process.env.TOOLBOX_PYTHON!, [resolve('scripts/real-e2e-fixture.py'), 'snapshot'], {
    encoding: 'utf8', windowsHide: true,
  })) as DatabaseSnapshot
}

async function authorize(page: Page, identity: 'consumer' | 'business' | 'business_cancel'): Promise<void> {
  await page.goto('/#/user/login')
  await page.getByLabel('授权码', { exact: true }).fill(credentials[identity])
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/verify' && r.request().method() === 'POST')
  await page.getByRole('button', { name: '验证并登录' }).click()
  expect((await response).status()).toBe(200)
  await expect(page).toHaveURL(identity === 'consumer' ? /#\/user\/tools/ : /#\/business\/overview/)
}

async function api(page: Page, path: string): Promise<unknown> {
  const token = await page.evaluate(() => sessionStorage.getItem('toolbox_token'))
  expect(token).toBeTruthy()
  const response = await page.request.get(path, { headers: { Authorization: `Bearer ${token}` } })
  expect(response.ok(), `${path} should be served by the real backend`).toBe(true)
  return response.json()
}

async function importWorkbook(page: Page): Promise<void> {
  // Every import journey starts at the rendered overview, including after a
  // reload. Changing the hash before Vue Router mounts races its initial
  // navigation; enter through the same ready sidebar that a user clicks.
  await expect(page.locator('.business-overview')).toBeVisible()
  await page.getByRole('complementary', { name: '专业批量工作台导航' })
    .getByRole('link', { name: '批量工作台', exact: true }).click()
  await expect(page).toHaveURL(/#\/business\/workspace/)
  await expect(page.getByTestId('business-workspace-page')).toBeVisible()
  await page.getByRole('button', { name: /自动上广告脚本/ }).click()
  const chooser = page.waitForEvent('filechooser')
  const worker = page.waitForEvent('worker')
  await page.getByTestId('business-file-upload').click()
  await (await chooser).setFiles(resolve('resources/templates/B端批量自动化测试数据.xlsx'))
  expect((await worker).url()).toContain('spreadsheet.worker-')
  await expect(page.locator('.import-result')).toHaveText('8 个演示项')
  await expect(page.locator('.selected-import')).toContainText('已匹配工作表')
}

async function startBatch(page: Page): Promise<string> {
  const created = page.waitForResponse(r => new URL(r.url()).pathname === '/api/demo/batches' && r.request().method() === 'POST')
  const started = page.waitForResponse(response => {
    const request = response.request()
    return /^\/api\/demo\/batches\/[^/]+$/.test(new URL(response.url()).pathname)
      && request.method() === 'PATCH' && (request.postDataJSON() as { status?: string }).status === 'running'
  })
  await page.getByRole('button', { name: '开始批量演示', exact: true }).click()
  const response = await created
  expect(response.status()).toBe(201)
  const body = await response.json() as { id: string; items: unknown[] }
  expect(body.items).toHaveLength(8)
  expect((await started).status()).toBe(200)
  return body.id
}

const browserErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  // Observe errors; deliberately no page.route, fake electronAPI, auth storage
  // injection or mocked responses. Credentials go through the actual forms.
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') errors.push(`Unexpected external request: ${url.origin}`)
  })
})
test.afterEach(async ({ page }) => { expect(browserErrors.get(page)).toEqual([]) })

test.afterAll(() => {
  const snapshot = database()
  writeFileSync(join(runtime, 'database-evidence.json'), JSON.stringify(snapshot, null, 2))
})

test('C 端真实授权激活、工具演示与结果留档，不越权进入 B 端', async ({ page }) => {
  await authorize(page, 'consumer')
  expect(database().authorizations.filter(row => row.status === 'active')).toHaveLength(1)
  expect(database().device_count).toBe(1)
  const token = await page.evaluate(() => sessionStorage.getItem('toolbox_token'))
  const forbidden = await page.request.get('/api/business/bootstrap', { headers: { Authorization: `Bearer ${token}` } })
  expect(forbidden.status()).toBe(403)
  const forbiddenBatch = await page.request.post('/api/demo/batches', {
    headers: { Authorization: `Bearer ${token}` },
    data: { tool_id: 'tool_ad_script', tool_name: '自动上广告脚本', platform_key: 'amazon', scenario_id: 'ad_script_walkthrough_v1', row_count: 1 },
  })
  expect(forbiddenBatch.status()).toBe(403)
  expect((await page.request.get('/api/demo/batches', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403)
  expect(database().batches).toHaveLength(0)
  await page.getByTestId('tool-card-物流模板标准版').click()
  await expect(page.getByTestId('tool-workspace').or(page.locator('.drawer-primary'))).toBeVisible()
  if (await page.locator('.drawer-primary').isVisible()) await page.locator('.drawer-primary').click()
  await expect(page.getByTestId('tool-workspace')).toBeVisible()
  await expect(page.getByTestId('execution-scope-note')).toContainText('不启动 Runner')
  // Browser product's lightweight Demo adapter is real shipped code. This is
  // NOT evidence of an Electron Runner or an external seller account action.
  await expect(page.locator('.result-card.success')).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('.result-proof-grid')).toHaveCount(0)
  await expect.poll(() => database().runs.filter(row => row.status === 'completed').length).toBe(1)
  const run = database().runs[0]!
  expect(run.completed_step_count).toBe(run.total_step_count)
  expect(database().live_run_count).toBe(0)
  await page.screenshot({ path: join(runtime, 'consumer-demo-completed.png'), fullPage: true })
  await page.getByRole('button', { name: '返回工具箱', exact: true }).last().click()
  await page.reload()
  await expect(page.getByTestId('tools-page')).toBeVisible()
  const runs = await api(page, '/api/demo/runs') as { items?: unknown[]; data?: unknown[] }
  expect(runs.items || runs.data).toHaveLength(1)
})

test('B 端原生 Excel Worker 导入、八项并发演示及父子结果真实落库', async ({ page }) => {
  await authorize(page, 'business')
  await importWorkbook(page)
  const payloads: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/demo/')) payloads.push(request.postData() || '')
  })
  const batchId = await startBatch(page)
  await expect.poll(() => database().batches.find(batch => batch.id === batchId)?.status).toBe('completed')
  const batch = database().batches.find(row => row.id === batchId)!
  expect(batch.row_count).toBe(8)
  expect(batch.queued_count + batch.playing_count).toBe(0)
  expect(batch.played_count + batch.error_count + batch.skipped_count).toBe(8)
  const items = database().items.filter(row => row.batch_id === batchId)
  expect(items).toHaveLength(8)
  expect(new Set(items.map(row => row.simulated_outcome))).toEqual(new Set(['completed_example', 'attention_example', 'failure_example']))
  expect(items.every(row => ['played', 'error', 'skipped'].includes(row.status))).toBe(true)
  expect(database().live_batch_count).toBe(0)
  expect(payloads.join('\n')).not.toMatch(/模板演示账号|password|cookie|@example|account_label|import_rows/)
  await page.screenshot({ path: join(runtime, 'business-demo-completed.png'), fullPage: true })
  await page.goto('/#/business/overview')
  await expect(page.locator('.attention-card')).toHaveCount(0)
  await expect(page.locator('.batch-count').first()).toHaveText('8/8 已结束')
  await page.goto('/#/business/license')
  await expect(page.locator('.limits-grid')).toContainText('已授权')
  await expect(page.locator('.limits-grid')).toContainText('1 / 5 台设备')
  await page.getByRole('button', { name: '刷新授权', exact: true }).click()
  await expect(page.locator('.limits-grid')).toContainText('1 / 5 台设备')
  await page.goto('/#/business/records')
  await expect(page.locator('.records-list article').first()).toContainText('演示完成')
  await page.reload()
  await expect(page.locator('.records-list article').first()).toContainText('演示完成')
  const persisted = await api(page, `/api/demo/batches/${batchId}`) as { status: string; items: unknown[] }
  expect(persisted.status).toBe('completed')
  expect(persisted.items).toHaveLength(8)
})

test('B 端真实取消保存终态，刷新后可再次导入并启动新批次', async ({ page }) => {
  await authorize(page, 'business_cancel')
  await importWorkbook(page)
  const first = await startBatch(page)
  await page.getByRole('button', { name: '退出演示', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '退出演示', exact: true }).click()
  await expect.poll(() => database().batches.find(row => row.id === first)?.status).toBe('cancelled')
  const cancelled = database().batches.find(row => row.id === first)!
  expect(cancelled.queued_count + cancelled.playing_count).toBe(0)
  expect(cancelled.skipped_count).toBeGreaterThan(0)
  await expect(page).toHaveURL(/#\/business\/overview/)
  await page.reload()
  await importWorkbook(page)
  const second = await startBatch(page)
  expect(second).not.toBe(first)
  await expect.poll(() => database().batches.find(row => row.id === second)?.status).toBe('completed')
  await page.goto('/#/business/records')
  await expect(page.locator('.records-list')).toContainText('已退出')
  await expect(page.locator('.records-list')).toContainText('演示完成')
})

test('B 端断网退出后重新打开页面，以同授权恢复取消意图并完成落库', async ({ page, context }) => {
  await authorize(page, 'business_cancel')
  await importWorkbook(page)
  const batchId = await startBatch(page)
  await expect.poll(() => database().batches.find(row => row.id === batchId)?.playing_count || 0).toBe(8)
  await page.getByRole('button', { name: '退出演示', exact: true }).click()
  await expect(page.locator('.el-message-box')).toBeVisible()
  await context.setOffline(true)
  try {
    await page.locator('.el-message-box').getByRole('button', { name: '退出演示', exact: true }).click()
    await expect(page).toHaveURL(/#\/business\/overview/)
    expect(database().batches.find(row => row.id === batchId)?.status).toBe('running')
    // Destroy the old application while still offline: the new instance must
    // recover the persisted intent, not just finish an in-memory pending fetch.
    await page.goto('about:blank')
  } finally {
    await context.setOffline(false)
  }
  await page.goto('/#/business/workspace')
  await expect(page.getByTestId('business-workspace-page')).toBeVisible()
  await expect.poll(() => database().batches.find(row => row.id === batchId)?.status, { timeout: 30_000 }).toBe('cancelled')
  const batch = database().batches.find(row => row.id === batchId)!
  expect(batch.queued_count + batch.playing_count).toBe(0)
  expect(batch.played_count + batch.error_count + batch.skipped_count).toBe(8)
  await page.goto('/#/business/records')
  await expect(page.locator('.records-list article').first()).toContainText('已退出')
})

test('后台真实登录、支出记账、创建续费及确认入账，汇总与数据库一致', async ({ page }) => {
  await page.goto('/#/admin/login')
  await page.getByLabel('管理账号', { exact: true }).fill(credentials.staff_username)
  await page.getByLabel('管理员密码', { exact: true }).fill(credentials.staff_password)
  await page.getByRole('button', { name: '登录管理后台' }).click()
  await expect(page).not.toHaveURL(/admin\/login/)
  await page.goto('/#/admin/expenses')
  await expect(page.getByRole('heading', { name: '公账支出' })).toBeVisible()
  await page.getByRole('button', { name: '记一笔支出' }).click()
  let drawer = page.locator('.el-drawer').last()
  await expect(drawer.locator('.el-select').first()).toContainText('开发')
  await drawer.locator('.el-input-number input').fill('320.50')
  await drawer.getByPlaceholder('例如：7 月阿里云服务器').fill('隔离验收云服务')
  const receipt = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1cAAAAASUVORK5CYII=', 'base64')
  await drawer.locator('input[type="file"]').setInputFiles({ name: 'isolated-receipt.png', mimeType: 'image/png', buffer: receipt })
  const expenseSaved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/expenses' && response.request().method() === 'POST')
  await drawer.getByRole('button', { name: '确认入账' }).click()
  expect((await expenseSaved).ok()).toBe(true)
  await expect(page.getByText('隔离验收云服务', { exact: true })).toBeVisible()
  await expect(page.getByText('¥320.50', { exact: true }).first()).toBeVisible()
  expect(database().attachments).toEqual([{ original_name: 'isolated-receipt.png', size_bytes: receipt.length }])
  await page.getByText('隔离验收云服务', { exact: true }).click()
  drawer = page.locator('.el-drawer').last()
  await expect(drawer.getByText('isolated-receipt.png')).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await drawer.getByRole('button', { name: '下载', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('isolated-receipt.png')
  const savedReceipt = join(runtime, 'downloaded-receipt.png')
  await download.saveAs(savedReceipt)
  expect(readFileSync(savedReceipt).equals(receipt)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(drawer).not.toBeVisible()
  await page.getByRole('tab', { name: /续费项目/ }).click()
  await page.getByRole('button', { name: '新建续费项目' }).click()
  drawer = page.locator('.el-drawer').last()
  await expect(drawer.locator('.el-select').first()).toContainText('工具会员')
  await drawer.getByPlaceholder('例如：Figma Professional').fill('隔离验收工具会员')
  await drawer.locator('.el-input-number input').first().fill('99.00')
  await drawer.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByText('隔离验收工具会员', { exact: true }).first()).toBeVisible()
  expect(database().expenses).toHaveLength(1)
  await page.getByRole('button', { name: '确认续费' }).first().click()
  drawer = page.locator('.el-drawer').last()
  await drawer.locator('.el-input-number input').fill('118.00')
  await drawer.getByRole('button', { name: '确认续费并入账' }).click()
  await expect(page.getByText('¥438.50', { exact: true }).first()).toBeVisible()
  expect(database().expenses).toHaveLength(2)
  expect(database().expenses.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(438.5)
  expect(database().occurrences).toHaveLength(1)
  expect(database().occurrences[0]?.status).toBe('paid')
  await page.reload()
  await expect(page.getByText('¥438.50', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: join(runtime, 'admin-expenses-persisted.png'), fullPage: true })
})

test('代理真实交付闭环：建档、提交订单、负责人收款发放、售后回复及跨代理隔离', async ({ page, context }) => {
  test.setTimeout(150_000)
  const customerName = '隔离代理 A 交付客户'
  const supportContent = '隔离验收：客户已取得授权，请协助说明首次安装步骤。'
  const supportReply = '已提供首次安装指引，客户可使用授权在本机登录。'
  const loginStaff = async (target: Page, username: string, password: string, destination: RegExp): Promise<void> => {
    await target.goto('/#/admin/login')
    await target.getByLabel('管理账号', { exact: true }).fill(username)
    await target.getByLabel('管理员密码', { exact: true }).fill(password)
    const login = target.waitForResponse(response => new URL(response.url()).pathname === '/api/staff/auth/login' && response.request().method() === 'POST')
    await target.getByRole('button', { name: '登录管理后台' }).click()
    expect((await login).ok()).toBe(true)
    await expect(target).toHaveURL(destination)
  }
  await loginStaff(page, credentials.agent_a_username, credentials.agent_a_password, /#\/agent\/overview/)
  await page.getByRole('navigation', { name: '代理导航' }).getByRole('link', { name: '我的客户', exact: true }).click()
  await page.getByRole('button', { name: '登记客户', exact: true }).click()
  let drawer = page.locator('.el-drawer:visible').last()
  await drawer.getByPlaceholder('用于识别和交付的名称').fill(customerName)
  await drawer.getByPlaceholder('微信、手机号或邮箱').fill('isolated-customer@example.invalid')
  const createdCustomer = page.waitForResponse(response => new URL(response.url()).pathname === '/api/agency/customers' && response.request().method() === 'POST')
  await drawer.getByRole('button', { name: '保存提交' }).click()
  const customerResponse = await createdCustomer
  expect(customerResponse.status()).toBe(201)
  const customer = (await customerResponse.json() as { data: { id: number; agency_id: number } }).data
  expect(customer.agency_id).toBe(credentials.agency_a_id)
  await expect(page.locator('.el-table__body').getByText(customerName, { exact: true })).toBeVisible()

  await page.getByRole('navigation', { name: '代理导航' }).getByRole('link', { name: '我的订单', exact: true }).click()
  await page.getByRole('button', { name: '提交订单', exact: true }).click()
  drawer = page.locator('.el-drawer:visible').last()
  await drawer.locator('.el-select').nth(0).click()
  await page.getByRole('option', { name: customerName, exact: true }).click()
  await drawer.locator('.el-select').nth(1).click()
  await page.getByRole('option', { name: /Y199/ }).click()
  const createdOrder = page.waitForResponse(response => new URL(response.url()).pathname === '/api/agency/orders' && response.request().method() === 'POST')
  await drawer.getByRole('button', { name: '提交待确认订单' }).click()
  const orderResponse = await createdOrder
  expect(orderResponse.status()).toBe(201)
  const order = (await orderResponse.json() as { data: { id: number; order_no: string; status: string; auth_code: null } }).data
  expect(order.status).toBe('pending')
  expect(order.auth_code).toBeNull()
  const ownOrder = page.locator('.el-table__row').filter({ hasText: order.order_no })
  await expect(ownOrder).toContainText('待确认收款')
  await ownOrder.getByRole('button', { name: '查看详情' }).click()
  await expect(page.getByRole('button', { name: '确认已收款', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // New tabs share the same origin but not the token/profile session.
  const owner = await context.newPage()
  const outsider = await context.newPage()
  try {
    await loginStaff(owner, credentials.staff_username, credentials.staff_password, /#\/admin\/(?!login)/)
    await owner.goto('/#/admin/agency')
    await owner.getByRole('navigation', { name: '代理管理分区' }).getByRole('button', { name: '订单交付' }).click()
    await owner.locator('.el-table__row').filter({ hasText: order.order_no }).getByRole('button', { name: '查看详情' }).click()
    let ownerDrawer = owner.locator('.el-drawer:visible').last()
    await ownerDrawer.getByRole('button', { name: '确认已收款', exact: true }).click()
    const paidResponse = owner.waitForResponse(response => new URL(response.url()).pathname === `/api/agency/orders/${order.id}/mark-paid`)
    await owner.getByRole('button', { name: '已核实，确认收款' }).click()
    expect((await paidResponse).ok()).toBe(true)
    const deliveryResponse = owner.waitForResponse(response => new URL(response.url()).pathname === `/api/agency/orders/${order.id}/deliver`)
    await ownerDrawer.getByRole('button', { name: '发放授权', exact: true }).click()
    const delivered = await deliveryResponse
    expect(delivered.ok()).toBe(true)
    const license = (await delivered.json() as { data: { auth_code: { id: number; code: string } } }).data.auth_code
    expect(license.code.length).toBeGreaterThan(8)
    await expect(ownerDrawer).toContainText('授权已生成')
    await owner.keyboard.press('Escape')

    await page.reload()
    await expect(page).toHaveURL(/#\/agent\/orders/)
    await expect(page.locator('.agent-main > header')).toContainText('隔离代理 A')
    await expect(page.locator('.el-table__row').filter({ hasText: order.order_no })).toContainText('已交付')
    await page.locator('.el-table__row').filter({ hasText: order.order_no }).getByRole('button', { name: '查看详情' }).click()
    drawer = page.locator('.el-drawer:visible').last()
    await expect(drawer.locator('.delivery-block code')).toHaveText(license.code)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.bringToFront()
    await drawer.getByRole('button', { name: '复制授权码' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(license.code)
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(drawer.getByRole('button', { name: '复制授权码' })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: join(runtime, `agent-delivery-${width}.png`), fullPage: true })
    }
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()
    await page.getByRole('navigation', { name: '代理导航' }).getByRole('link', { name: '售后支持', exact: true }).click()
    await page.getByRole('button', { name: '提交售后申请', exact: true }).click()
    drawer = page.locator('.el-drawer:visible').last()
    await drawer.locator('.el-select').nth(0).click()
    await page.getByRole('option', { name: customerName, exact: true }).click()
    await drawer.locator('.el-select').nth(2).click()
    await page.getByRole('option', { name: new RegExp(order.order_no) }).click()
    await drawer.getByPlaceholder('描述问题、期望的处理和必要的背景；不要填写客户密码或授权凭据。').fill(supportContent)
    const createdSupport = page.waitForResponse(response => new URL(response.url()).pathname === '/api/agency/requests' && response.request().method() === 'POST')
    await drawer.getByRole('button', { name: '保存提交' }).click()
    const supportResponse = await createdSupport
    expect(supportResponse.status()).toBe(201)
    const support = (await supportResponse.json() as { data: { id: number; order_id: number } }).data
    expect(support.order_id).toBe(order.id)
    await expect(page.locator('.el-table__row').filter({ hasText: supportContent })).toContainText('待处理')

    await owner.getByRole('navigation', { name: '代理管理分区' }).getByRole('button', { name: '售后申请' }).click()
    await owner.locator('.el-table__row').filter({ hasText: supportContent }).getByRole('button', { name: '查看详情' }).click()
    ownerDrawer = owner.locator('.el-drawer:visible').last()
    await ownerDrawer.getByPlaceholder('说明实际处理情况，不把未完成的退款或延期描述为已完成。').fill(supportReply)
    const replied = owner.waitForResponse(response => new URL(response.url()).pathname === `/api/agency/requests/${support.id}` && response.request().method() === 'PATCH')
    await ownerDrawer.getByRole('button', { name: '保存回复' }).click()
    expect((await replied).ok()).toBe(true)
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    const ownSupport = page.locator('.el-table__row').filter({ hasText: supportContent })
    await expect(ownSupport).toContainText('已回复处理')
    await ownSupport.getByRole('button', { name: '查看详情' }).click()
    await expect(page.locator('.el-drawer:visible').last()).toContainText(supportReply)

    await loginStaff(outsider, credentials.agent_b_username, credentials.agent_b_password, /#\/agent\/overview/)
    await outsider.getByRole('navigation', { name: '代理导航' }).getByRole('link', { name: '我的客户', exact: true }).click()
    await expect(outsider.locator('.pagination')).toContainText('共 0 条')
    await expect(outsider.locator('.agent-main')).not.toContainText(customerName)
    const headers = { Authorization: `Bearer ${await outsider.evaluate(() => sessionStorage.getItem('toolbox_token'))}` }
    for (const target of ['customers', 'orders', 'licenses', 'requests']) {
      const response = await outsider.request.get(`/api/agency/${target}`, { headers })
      expect(response.ok()).toBe(true)
      expect(await response.json()).toMatchObject({ data: [], total: 0 })
    }
    for (const target of [`customers/${customer.id}`, `orders/${order.id}`, `licenses/${license.id}`, `requests/${support.id}`]) {
      expect((await outsider.request.get(`/api/agency/${target}`, { headers })).status()).toBe(404)
    }
    expect((await outsider.request.get(`/api/agency/customers?agency_id=${credentials.agency_a_id}`, { headers })).status()).toBe(403)
    expect((await outsider.request.get('/api/expenses', { headers })).status()).toBe(403)
    expect((await outsider.request.post(`/api/agency/orders/${order.id}/mark-paid`, { headers })).status()).toBe(403)
    const exportResponse = await outsider.request.get('/api/agency/orders/export', { headers })
    expect(exportResponse.ok()).toBe(true)
    const exported = await exportResponse.text()
    expect(exported).not.toContain(customerName)
    expect(exported).not.toContain(order.order_no)
    expect(exported).not.toContain(license.code)
    // The owner and Agent A remain independently authenticated after Agent B signs in.
    await page.reload()
    await expect(page.locator('.agent-main > header')).toContainText('隔离代理 A')
    expect(await api(page, '/api/agency/summary')).toMatchObject({ data: { customers: 1, orders: 1, delivered_orders: 1, open_requests: 0 } })
  } finally {
    await owner.close()
    await outsider.close()
  }
})
