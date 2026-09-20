import { expect, test, type Page } from '@playwright/test'

const observations = new WeakMap<Page, { api: string[], errors: string[] }>()

test.beforeEach(async ({ page }) => {
  const observed = { api: [] as string[], errors: [] as string[] }
  observations.set(page, observed)
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) observed.api.push(request.url())
  })
  page.on('pageerror', error => observed.errors.push(error.message))
  // No test may contact an external download host or production service.
  await page.route('https://**', route => route.abort())
})

test.afterEach(async ({ page }) => {
  expect(observations.get(page)?.api).toEqual([])
  expect(observations.get(page)?.errors).toEqual([])
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`complete visual content remains usable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('赛训的专注')
    for (const id of ['main-content', 'capabilities', 'audiences', 'workflow', 'faq']) {
      const section = page.locator(`#${id}`)
      await section.scrollIntoViewIfNeeded()
      await expect(section).toBeVisible()
    }
    expect(await page.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await expect(page.locator('a[href^="/user/"], a[href^="/admin"], a[href^="/business"]')).toHaveCount(0)
    await page.getByText('官网和桌面端有什么区别？', { exact: true }).click()
    await expect(page.locator('.faq-answer').filter({ hasText: '在桌面端完成授权登录' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`marketing-${viewport.width}.png`), fullPage: true })
  })
}

test('mobile navigation, local preview consultation, terms and missing application routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '打开导航', exact: true }).click()
  await page.getByRole('navigation').getByRole('link', { name: '产品价值' }).click()
  await expect(page.getByRole('button', { name: '打开导航', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await page.getByTestId('consultation-trigger').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('示意邮箱不可用于联系')
  await dialog.getByRole('button', { name: '团队席位', exact: true }).click()
  await expect(dialog).toContainText('成员人数')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await page.getByRole('link', { name: '服务条款', exact: true }).click()
  await expect(page).toHaveURL(/\/terms$/)
  await expect(page.getByRole('heading', { name: '服务条款', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回课赛通官网', exact: true }).last().click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('赛训的专注')
  for (const path of ['/user/login', '/business/workspace', '/admin/login', '/not-a-page']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('这个页面暂时找不到了')
  }
})

test('brand motion really pauses, resumes and replays, with a complete team scene', async ({ page }) => {
  await page.goto('/')
  const motion = page.locator('.brand-scene-motion')
  await expect.poll(() => motion.evaluate(element => getComputedStyle(element).animationPlayState)).toBe('running')
  await page.getByRole('button', { name: '暂停品牌动效', exact: true }).click()
  await expect.poll(() => motion.evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused')
  await page.getByRole('button', { name: '播放品牌动效', exact: true }).click()
  await expect.poll(() => motion.evaluate(element => getComputedStyle(element).animationPlayState)).toBe('running')
  await expect(page.getByRole('button', { name: '重播品牌动效', exact: true })).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: '重播品牌动效', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停品牌动效', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '团队批次', exact: true }).click()
  await expect(page.getByTestId('product-scenario')).toContainText('先把账号整理好')
  await expect(page.getByTestId('product-scenario')).toContainText('产品流程示意 · 非实时执行')
})

test('reduced motion honors the system preference without hiding content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.motion-toggle')).toBeDisabled()
  await expect(page.locator('.motion-toggle')).toHaveText('已减少动态效果')
  expect(await page.locator('.brand-scene-motion').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  expect(await page.locator('[data-reveal]').evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1'))).toBe(true)
})

test('download uses the published URL, without fetching a local or cross-origin manifest', async ({ page, request }) => {
  const metadata = await (await request.get('/marketing-version.json')).json() as { downloadUrl: string, commitSha: string, kind: string }
  expect(metadata.kind).toBe('kst-marketing')
  expect(metadata.commitSha).toMatch(/^[a-f0-9]{40}$/)
  const manifests: string[] = []
  page.on('request', incoming => { if (incoming.url().includes('latest.yml')) manifests.push(incoming.url()) })
  await page.route(metadata.downloadUrl, route => route.fulfill({
    status: 200, contentType: 'application/octet-stream',
    headers: { 'Content-Disposition': 'attachment; filename="kst-test-only.exe"' },
    body: 'ISOLATED MARKETING DOWNLOAD TEST — NOT AN EXECUTABLE',
  }))
  await page.goto('/')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Windows 桌面端', exact: true }).first().click()
  const download = await downloadPromise
  expect(download.url()).toBe(metadata.downloadUrl)
  expect(manifests).toEqual([])
})
