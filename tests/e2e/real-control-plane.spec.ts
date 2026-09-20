import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const runtime = process.env.KST_REAL_E2E_DIR!
const credentials = JSON.parse(readFileSync(join(runtime, 'credentials.json'), 'utf8')) as {
  consumer: string; business: string; business_cancel: string; staff_username: string; staff_password: string
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
  await drawer.locator('.el-input-number input').fill('320.50')
  await drawer.getByPlaceholder('例如：7 月阿里云服务器').fill('隔离验收云服务')
  const receipt = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1cAAAAASUVORK5CYII=', 'base64')
  await drawer.locator('input[type="file"]').setInputFiles({ name: 'isolated-receipt.png', mimeType: 'image/png', buffer: receipt })
  await drawer.getByRole('button', { name: '确认入账' }).click()
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
