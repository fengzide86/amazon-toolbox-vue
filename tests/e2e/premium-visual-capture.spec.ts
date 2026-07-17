import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { UpdateSnapshot } from '../../src/shared/ipc/update-contract'

const outputRoot = join(process.cwd(), 'test-results', 'visual-1.7.6')
const widths = [1365, 1024, 768] as const

const businessPlan = {
  id: 6,
  name: 'B端内部验证版',
  price: 0,
  duration_days: 30,
  status: 'active',
  features: '专业工作台、本地批量导入、多账号浏览器现场',
  product_type: 'business',
  entitlements: {
    batch_execution: true,
    multi_account_workspace: true,
    desktop_notification: true,
    max_batch_rows: 50,
    max_open_sessions: 6,
  },
}

const consumerPlan = {
  id: 1,
  name: '标准版',
  price: 299,
  duration_days: 30,
  status: 'active',
  features: '自动化工具',
  product_type: 'consumer',
  entitlements: {},
}

const businessUser = {
  role: 'user',
  product_type: 'business',
  business_workspace_enabled: true,
  plan_name: businessPlan.name,
  expires_at: '2026-08-16T00:00:00+08:00',
  seat_limit: 1,
  seat_used: 1,
  max_devices: 1,
  device_used: 1,
  entitlements: businessPlan.entitlements,
}

const consumerUser = {
  role: 'user',
  product_type: 'consumer',
  business_workspace_enabled: false,
  plan_name: consumerPlan.name,
  expires_at: '2026-08-16T00:00:00+08:00',
  seat_limit: 1,
  seat_used: 1,
  max_devices: 1,
  device_used: 1,
  entitlements: { desktop_notification: true },
}

const consumerTool = {
  id: 'tool_register',
  name: '亚马逊账号自动处理',
  description: '选择业务后，系统会打开亚马逊页面并自动完成处理。',
  category: 'automation',
  release_status: 'available',
  target_url: 'https://sellercentral.amazon.com/',
  available_plans: [1],
  capability_tags: ['自动填报', '页面核验', '结果确认'],
  supports_batch: false,
}

function response(data: unknown): string {
  return JSON.stringify({ success: true, data })
}

async function prepareRole(page: Page, role: 'consumer' | 'business' | 'admin', withUpdate = false): Promise<void> {
  const user = role === 'business' ? businessUser : consumerUser
  await page.addInitScript(({ currentRole, currentUser, updateEnabled }) => {
    sessionStorage.setItem('toolbox_auth', JSON.stringify({ token: 'visual-token' }))
    sessionStorage.setItem('toolbox_token', 'visual-token')
    sessionStorage.setItem('toolbox_role', currentRole === 'admin' ? 'admin' : 'user')
    localStorage.setItem('toolbox_user', JSON.stringify(currentUser))
    localStorage.setItem('toolbox_device_id', 'visual-device')
    localStorage.setItem('toolbox_device_name', '视觉验收设备')

    if (updateEnabled) {
      const snapshot: UpdateSnapshot = {
        supported: true,
        status: 'available',
        currentVersion: '1.7.5',
        availableVersion: '1.7.6',
        releaseNotes: ['优化专业工作台体验', '提升亚马逊页面打开稳定性'],
        downloadBytes: 52_428_800,
        canRestart: false,
      }
      window.electronAPI = {
        ...(window.electronAPI || {}),
        updates: {
          getState: async () => snapshot,
          check: async () => snapshot,
          startDownload: async () => ({ ...snapshot, status: 'downloading', percent: 38 }),
          cancelDownload: async () => ({ ...snapshot, status: 'cancelled' }),
          install: async () => snapshot,
          defer: async () => snapshot,
          onState: () => () => {},
        },
      }
    }
  }, { currentRole: role, currentUser: user, updateEnabled: withUpdate })

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let data: unknown = []

    if (path === '/api/auth/me') data = role === 'admin' ? { role: 'admin' } : user
    else if (path === '/api/business/bootstrap') data = { ...businessUser, tools: [] }
    else if (path === '/api/business/batches') data = []
    else if (path === '/api/plans/admin') data = [consumerPlan, businessPlan]
    else if (path === '/api/plans') data = [consumerPlan]
    else if (path === '/api/auth-codes') {
      data = [{
        id: 7,
        code: 'BUSI-****-7X9Q',
        plan_id: 6,
        plan_name: businessPlan.name,
        product_type: 'business',
        entitlements: businessPlan.entitlements,
        status: 'active',
        max_devices: 1,
        seat_limit: 1,
        seat_used: 0,
        device_used: 0,
        devices: [],
        expires_at: '2026-08-16T00:00:00+08:00',
        created_at: '2026-07-17T00:00:00+08:00',
      }]
    } else if (path === '/api/settings') {
      data = [{ key: 'business_workspace_enabled', value: 'true' }]
    } else if (path === '/api/tools') {
      data = role === 'consumer' ? [consumerTool] : []
    } else if (path === '/api/announcements/feed') {
      data = []
    } else if (path === '/api/admin/action-center') {
      data = {
        summary: {
          expiring_authorizations: 1,
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
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: response(data) })
  })
}

async function capture(page: Page, width: number, name: string): Promise<void> {
  await expect(page.locator('main')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(250)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)

  const undersizedControls = await page.locator('button:visible, input:visible, [role="menuitem"]:visible').evaluateAll(elements =>
    elements.filter(element => Number.parseFloat(getComputedStyle(element).fontSize) < 14).length,
  )
  expect(undersizedControls).toBe(0)

  const directory = join(outputRoot, String(width))
  mkdirSync(directory, { recursive: true })
  await page.screenshot({ path: join(directory, `${name}.png`), animations: 'disabled' })
}

for (const width of widths) {
  test(`1.7.6 ${width}px C/B/Admin visual capture`, async ({ browser }) => {
    const loginPage = await browser.newPage({ viewport: { width, height: 768 } })
    await loginPage.goto('/#/user/login', { waitUntil: 'networkidle' })
    await expect(loginPage.locator('.login-page')).toBeVisible()
    const loginOverflow = await loginPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(loginOverflow).toBeLessThanOrEqual(1)
    const loginDirectory = join(outputRoot, String(width))
    mkdirSync(loginDirectory, { recursive: true })
    await loginPage.screenshot({ path: join(loginDirectory, 'login.png'), animations: 'disabled' })
    await loginPage.close()

    const consumerPage = await browser.newPage({ viewport: { width, height: 768 } })
    await prepareRole(consumerPage, 'consumer', true)
    await consumerPage.goto('/#/user/tools', { waitUntil: 'networkidle' })
    await capture(consumerPage, width, 'consumer-tools-update')
    await consumerPage.close()

    const businessPage = await browser.newPage({ viewport: { width, height: 768 } })
    await prepareRole(businessPage, 'business')
    for (const route of ['overview', 'workspace', 'records', 'license']) {
      await businessPage.goto(`/#/business/${route}`, { waitUntil: 'networkidle' })
      await capture(businessPage, width, `business-${route}`)
    }
    await businessPage.close()

    const adminPage = await browser.newPage({ viewport: { width, height: 768 } })
    await prepareRole(adminPage, 'admin')
    for (const route of ['business-access', 'authcodes?product=business']) {
      await adminPage.goto(`/#/admin/${route}`, { waitUntil: 'networkidle' })
      if (width === 768 && route.startsWith('authcodes')) {
        const columns = await adminPage.locator('.generate-form').evaluate(element =>
          getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length,
        )
        expect(columns).toBe(1)
      }
      await capture(adminPage, width, `admin-${route.split('?')[0]}`)
    }
    await adminPage.close()
  })
}
