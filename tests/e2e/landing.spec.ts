import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test.use({ trace: 'on' })

async function openNavigationIfCollapsed(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: '打开导航', exact: true })
  if (await toggle.isVisible()) await toggle.click()
}

async function revealPageSections(page: Page): Promise<void> {
  for (const element of await page.locator('[data-reveal]').all()) {
    // Reach the observer's inset viewport instead of stopping in its bottom 24px margin.
    await element.evaluate(target => target.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await expect(element).toHaveCSS('opacity', '1')
  }
  await page.locator('.landing-footer').scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }))
})

for (const width of [1440, 1280, 1024, 768, 390]) {
  test(`官网在 ${width}px 可阅读、导航且无横向溢出`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.locator('.landing')).toBeVisible()
    await expect(page.locator('.landing')).toHaveCSS('outline-style', 'none')
    await expect(page.locator('h1')).toContainText('少一点重复')
    await expect(page.locator('h1')).toContainText('赛训的专注')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`landing-hero-${width}.png`), animations: 'disabled' })
    await revealPageSections(page)
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: true, animations: 'disabled' })
    await page.getByRole('button', { name: '团队批次', exact: true }).click()
    await expect(page.getByTestId('product-scenario')).toContainText('在同一处组织批次')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.getByTestId('product-scenario').screenshot({ path: testInfo.outputPath(`landing-team-scenario-${width}.png`), animations: 'disabled' })
    await page.getByRole('button', { name: '个人工具', exact: true }).click()
    await openNavigationIfCollapsed(page)
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '产品价值' }).click()
    await expect(page).toHaveURL(/#\/#capabilities$/)
    await expect(page.locator('#capabilities')).toBeInViewport()
    await expect(page.locator('.landing')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('1920px 桌面宽屏保持居中和阅读宽度，主操作与两种完整场景首屏可见', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  const hero = page.locator('.hero')
  const scenario = page.getByTestId('product-scenario')
  const primaryAction = hero.getByRole('button', { name: '下载 Windows 桌面端', exact: true })
  await expect(primaryAction).toBeInViewport({ ratio: 1 })
  await expect(scenario).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeInViewport({ ratio: 1 })
  const geometry = await hero.locator('.landing-container').evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return { left: bounds.left, right: innerWidth - bounds.right, width: bounds.width }
  })
  expect(Math.abs(geometry.left - geometry.right)).toBeLessThanOrEqual(1)
  expect(geometry.width).toBeGreaterThanOrEqual(1080)
  expect(geometry.width).toBeLessThanOrEqual(1280)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('landing-hero-1920-personal.png'), animations: 'disabled' })
  await scenario.screenshot({ path: testInfo.outputPath('landing-scenario-1920-personal.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '团队批次', exact: true }).click()
  await expect(page.getByRole('button', { name: '团队批次', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(scenario).toContainText('批次')
  await expect(scenario).toBeInViewport({ ratio: 1 })
  await expect(primaryAction).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath('landing-hero-1920-team.png'), animations: 'disabled' })
  await scenario.screenshot({ path: testInfo.outputPath('landing-scenario-1920-team.png'), animations: 'disabled' })
  await revealPageSections(page)
  await page.screenshot({ path: testInfo.outputPath('landing-full-1920.png'), fullPage: true, animations: 'disabled' })
  expect(errors).toEqual([])
})

test('官网内容明确主场景、用户与工具，使用边界集中在常见问题且不启动业务请求', async ({ page }) => {
  const businessRequests: string[] = []
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname
    if (pathname.startsWith('/api/') && pathname !== '/api/health/live') businessRequests.push(pathname)
  })
  await page.goto('/')
  const hero = page.locator('.hero')
  await expect(hero).toContainText('亚马逊赛训')
  await expect(hero).toContainText('参赛学生')
  await expect(hero).toContainText('代打团队')
  const tools = page.locator('#capabilities .tool-card')
  await expect(tools).toHaveCount(2)
  await expect(tools.nth(0)).toContainText('物流模板标准版')
  await expect(tools.nth(1)).toContainText('物流模板成本优选版')
  for (const tool of await tools.all()) await expect(tool).toContainText('支持演示')
  const audiences = page.locator('#audiences .audience-card')
  await expect(audiences.nth(0)).toContainText('参赛学生')
  await expect(audiences.nth(1)).toContainText('代打团队')

  const audienceQuestion = page.locator('#faq details').filter({ hasText: '课赛通适合谁？' })
  await audienceQuestion.locator('summary').click()
  await expect(audienceQuestion.locator('.faq-answer')).toBeVisible()
  await expect(audienceQuestion).toContainText(/亚马逊赛训/)
  await expect(audienceQuestion).toContainText(/速卖通[^。]*(?:扩展|验证)/)

  const runtimeQuestion = page.locator('#faq details').filter({ hasText: '官网和桌面端有什么区别？' })
  await runtimeQuestion.locator('summary').click()
  await expect(runtimeQuestion.locator('.faq-answer')).toBeVisible()
  await expect(runtimeQuestion).toContainText('Windows')
  await expect(runtimeQuestion).toContainText(/真实[^。]*(?:任务|自动化|自动执行)/)

  const batchQuestion = page.locator('#faq details').filter({ hasText: '批量演示等于真实账号并发执行吗？' })
  await batchQuestion.locator('summary').click()
  await expect(batchQuestion.locator('.faq-answer')).toBeVisible()
  await expect(batchQuestion).toContainText(/50\s*(?:个)?账号/)
  await expect(batchQuestion).toContainText('演示')
  await expect(batchQuestion).toContainText(/顺序|逐个/)

  const authorizationQuestion = page.locator('#faq details').filter({ hasText: '下载后可以直接使用吗？套餐如何确定？' })
  await authorizationQuestion.locator('summary').click()
  await expect(authorizationQuestion.locator('.faq-answer')).toBeVisible()
  await expect(authorizationQuestion).toContainText(/下载[^。]*不(?:代表|等于|会自动)[^。]*授权/)
  await expect(authorizationQuestion).toContainText(/(?:不|未)[^。]*在线购买/)
  expect(businessRequests).toEqual([])
})

test('模拟咨询明确预览性质，个人与团队引导可切换且不发送业务请求', async ({ page }, testInfo) => {
  const businessRequests: string[] = []
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname
    if (pathname.startsWith('/api/') && pathname !== '/api/health/live') businessRequests.push(pathname)
  })
  await page.goto('/')
  await page.getByTestId('consultation-trigger').click()
  const dialog = page.getByRole('dialog', { name: '咨询课赛通', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('预览演示')
  await expect(dialog).toContainText('hello@kst.example')
  await expect(dialog).toContainText('不会发送消息')
  await expect(dialog).toContainText('不收集联系方式')
  await expect(dialog.locator('form, input, textarea, a[href]')).toHaveCount(0)
  const directions = dialog.getByRole('group', { name: '选择咨询方向', exact: true })
  const personal = directions.getByRole('button', { name: '个人工具', exact: true })
  const team = directions.getByRole('button', { name: '团队席位', exact: true })
  await expect(personal).toHaveAttribute('aria-pressed', 'true')
  await expect(team).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.locator('.consultation-guidance')).toHaveAttribute('aria-live', 'polite')
  await expect(dialog.locator('.consultation-guidance')).toContainText('设备')
  await team.click()
  await expect(team).toHaveAttribute('aria-pressed', 'true')
  await expect(personal).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.locator('.consultation-guidance')).toContainText('成员人数')
  await expect(dialog.locator('.consultation-guidance')).toContainText('需要的席位')
  await dialog.screenshot({ path: testInfo.outputPath('consultation-desktop-team.png'), animations: 'disabled' })
  await personal.click()
  await expect(personal).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.locator('.consultation-guidance')).toContainText('设备')
  await expect(dialog.locator('.consultation-guidance')).not.toContainText('成员人数')
  expect(businessRequests).toEqual([])
})

test('模拟咨询键盘焦点留在弹窗内，Esc、关闭与确认均恢复入口焦点', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('consultation-trigger')
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '咨询课赛通', exact: true })
  const close = dialog.getByRole('button', { name: '关闭咨询窗口', exact: true })
  const acknowledge = dialog.getByRole('button', { name: '我了解了', exact: true })
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(acknowledge).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await close.click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await acknowledge.click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('模拟咨询内部点击不关闭，遮罩关闭后恢复对应的首屏入口焦点', async ({ page }) => {
  await page.goto('/')
  const trigger = page.locator('.hero-footnote').getByRole('button', { name: '咨询授权', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '咨询课赛通', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('heading', { name: '咨询课赛通', exact: true }).click()
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThan(16)
  await page.mouse.click(bounds!.x / 2, bounds!.y + bounds!.height / 2)
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('390px 手机咨询弹窗可完整操作、无横向溢出且关闭后可继续浏览', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const trigger = page.getByTestId('consultation-trigger')
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '咨询课赛通', exact: true })
  await expect(dialog).toBeVisible()
  const geometry = await dialog.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, overflow: element.scrollWidth - element.clientWidth }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(16)
  expect(geometry.right).toBeLessThanOrEqual(374)
  expect(geometry.top).toBeGreaterThanOrEqual(20)
  expect(geometry.bottom).toBeLessThanOrEqual(824)
  expect(geometry.overflow).toBeLessThanOrEqual(1)
  await expect(dialog.getByRole('button', { name: '关闭咨询窗口', exact: true })).toBeInViewport({ ratio: 1 })
  await dialog.getByRole('button', { name: '团队席位', exact: true }).click()
  await expect(dialog.locator('.consultation-guidance')).toContainText('成员人数')
  await page.screenshot({ path: testInfo.outputPath('consultation-mobile-390.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: '我了解了', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('页面程序焦点无整页黑框，链接和按钮仍有键盘焦点提示', async ({ page }) => {
  await page.goto('/')
  const landing = page.locator('.landing')
  await expect(landing).toBeFocused()
  await expect(landing).toHaveCSS('outline-style', 'none')
  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: '跳至主要内容', exact: true })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page.locator('#main-content')).toHaveCSS('outline-style', 'none')
  const link = page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '产品价值', exact: true })
  await link.focus()
  await expect(link).toHaveCSS('outline-style', 'solid')
  await expect(link).toHaveCSS('outline-width', '3px')
  const button = page.locator('.hero-actions').first().getByRole('button', { name: /下载/ })
  await button.focus()
  await expect(button).toHaveCSS('outline-style', 'solid')
  await expect(button).toHaveCSS('outline-width', '3px')
})

test('页内导航与浏览器回退保留官网，滚动后导航固定且不遮住目标标题', async ({ page }) => {
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: '主导航' })
  await navigation.getByRole('link', { name: '产品价值', exact: true }).click()
  await expect(page).toHaveURL(/#\/#capabilities$/)
  await navigation.getByRole('link', { name: '开始使用', exact: true }).click()
  await expect(page).toHaveURL(/#\/#workflow$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/#capabilities$/)
  await expect(page.locator('#capabilities')).toBeInViewport()

  const bounds = await page.evaluate(() => {
    const header = document.querySelector('.landing-nav')!.getBoundingClientRect()
    const target = document.querySelector('#capabilities')!.getBoundingClientRect()
    return { headerTop: header.top, headerBottom: header.bottom, targetTop: target.top, scrollY }
  })
  expect(bounds.scrollY).toBeGreaterThan(200)
  expect(Math.abs(bounds.headerTop)).toBeLessThanOrEqual(1)
  expect(bounds.targetTop).toBeGreaterThanOrEqual(bounds.headerBottom - 1)
  await page.getByRole('link', { name: '课赛通 KST 首页', exact: true }).click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThanOrEqual(1)
})

test('移动菜单支持键盘、Esc 关闭和焦点返回', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: '打开导航', exact: true })
  await toggle.focus()
  await page.keyboard.press('Enter')
  const closeToggle = page.getByRole('button', { name: '关闭导航', exact: true })
  await expect(closeToggle).toHaveAttribute('aria-expanded', 'true')
  const navigation = page.getByRole('navigation', { name: '主导航' })
  await expect(navigation).toBeVisible()
  await navigation.getByRole('link', { name: '产品价值', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(navigation).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await page.locator('.hero-footnote').click()
  await expect(navigation).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await navigation.getByRole('link', { name: '常见问题', exact: true }).click()
  await expect(page).toHaveURL(/#\/#faq$/)
  await expect(navigation).toBeHidden()
  await expect(page.locator('#faq')).toBeInViewport()
  await toggle.click()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(navigation).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(navigation).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('品牌官网不复刻应用、不请求业务数据，场景说明可读而装饰图不干扰辅助技术', async ({ page }) => {
  const businessRequests: string[] = []
  const healthMethods: string[] = []
  const retiredArtRequests: string[] = []
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname
    // The shared application shell performs a read-only connectivity probe, not a business request.
    if (pathname === '/api/health/live') healthMethods.push(request.method())
    else if (pathname.startsWith('/api/')) businessRequests.push(request.url())
    if (pathname.includes('route-sculpture')) retiredArtRequests.push(request.url())
  })
  await page.goto('/')
  const landing = page.locator('.landing')
  const art = page.getByTestId('brand-hero-art')
  await expect(art).toBeVisible()
  await expect(art).not.toHaveAttribute('aria-hidden', 'true')
  await expect(art.getByRole('heading', { name: '带上你的任务资料', exact: true })).toBeVisible()
  await expect(art.getByRole('heading', { name: '选用适合的工具', exact: true })).toBeVisible()
  await expect(art.getByRole('heading', { name: '过程可见，结果可回看', exact: true })).toBeVisible()
  await expect(art).toContainText('产品流程示意 · 非实时执行')
  await expect(art.locator('.illustration')).toHaveCount(3)
  for (const illustration of await art.locator('.illustration').all()) {
    await expect(illustration).toHaveAttribute('aria-hidden', 'true')
  }
  expect(await art.locator('img').evaluateAll(images => images.every(image => {
    const source = image.getAttribute('src') ?? ''
    return source.startsWith('data:image/svg+xml') || new URL(source, location.href).pathname.endsWith('.svg')
  }))).toBe(true)
  await expect(art.locator('a, button, input, [tabindex="0"]')).toHaveCount(0)
  await expect(page.getByTestId('landing-product-preview')).toHaveCount(0)
  await expect(landing.locator('table, [role="tablist"], [role="tabpanel"]')).toHaveCount(0)
  await expect(landing).not.toContainText('演示账号 01')
  const navigation = page.getByRole('navigation', { name: '主导航' })
  await navigation.getByRole('link', { name: '适用人群', exact: true }).click()
  await expect(page).toHaveURL(/#\/#audiences$/)
  await expect(page.locator('#audiences')).toBeInViewport()
  await expect(page.locator('#audiences')).toContainText('参赛学生')
  await expect(page.locator('.team-section')).toContainText('代打团队')
  await revealPageSections(page)
  expect(businessRequests).toEqual([])
  expect(retiredArtRequests).toEqual([])
  expect(healthMethods.every(method => method === 'GET')).toBe(true)
})

test('产品场景可用键盘往返切换，只更新本地宣传内容且不启动业务请求', async ({ page }, testInfo) => {
  const businessRequests: string[] = []
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname
    if (pathname.startsWith('/api/') && pathname !== '/api/health/live') businessRequests.push(request.url())
  })
  await page.goto('/')
  const scenarios = page.getByRole('group', { name: '查看产品场景', exact: true })
  const personal = scenarios.getByRole('button', { name: '个人工具', exact: true })
  const team = scenarios.getByRole('button', { name: '团队批次', exact: true })
  const content = page.getByTestId('product-scenario')
  await expect(content).toHaveAttribute('aria-live', 'polite')
  await expect(content).toHaveAttribute('aria-atomic', 'true')
  await expect(personal).toHaveAttribute('aria-controls', 'product-scenario')
  await expect(team).toHaveAttribute('aria-controls', 'product-scenario')
  await expect(personal).toHaveAttribute('aria-pressed', 'true')
  await expect(team).toHaveAttribute('aria-pressed', 'false')
  await expect(content).toContainText('带上你的任务资料')
  await team.focus()
  await page.keyboard.press('Enter')
  await expect(team).toBeFocused()
  await expect(team).toHaveAttribute('aria-pressed', 'true')
  await expect(personal).toHaveAttribute('aria-pressed', 'false')
  await expect(content).toContainText('先把账号整理好')
  await expect(content).toContainText('在同一处组织批次')
  await expect(content).toContainText('需要处理时，及时接手')
  await expect(content).not.toContainText('带上你的任务资料')
  await content.screenshot({ path: testInfo.outputPath('team-scenario-keyboard.png'), animations: 'disabled' })
  await personal.focus()
  await page.keyboard.press('Space')
  await expect(personal).toBeFocused()
  await expect(personal).toHaveAttribute('aria-pressed', 'true')
  await expect(team).toHaveAttribute('aria-pressed', 'false')
  await expect(content).toContainText('带上你的任务资料')
  await expect(content).not.toContainText('先把账号整理好')
  await expect(page).toHaveURL(/\/#\/$/)
  expect(businessRequests).toEqual([])
})

test('切换产品场景保留暂停和减少动态效果偏好，不自动重启动画', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByRole('button', { name: '暂停品牌动效', exact: true }).click()
  await page.getByRole('button', { name: '团队批次', exact: true }).click()
  await expect(page.getByRole('button', { name: '播放品牌动效', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const art = page.getByTestId('brand-hero-art')
  await expect(art.getByRole('heading', { name: '在同一处组织批次', exact: true })).toBeVisible()
  const pausedStates = await art.evaluate(element => element.getAnimations({ subtree: true }).map(animation => animation.playState))
  expect(pausedStates.length).toBeGreaterThan(0)
  expect(pausedStates.every(state => state === 'paused')).toBe(true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '个人工具', exact: true }).click()
  await expect(page.getByRole('button', { name: '已减少动态效果', exact: true })).toBeDisabled()
  await expect(art.getByRole('heading', { name: '带上你的任务资料', exact: true })).toBeVisible()
  await expect.poll(() => art.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0)
})

test('品牌资产加载成功，有信息的图片保留文本替代、装饰图片为空替代文本', async ({ page }) => {
  await page.goto('/')
  await revealPageSections(page)
  const images = page.locator('.landing img')
  expect(await images.count()).toBeGreaterThan(0)
  await expect.poll(() => images.evaluateAll(elements => elements.every(element => {
    const image = element as HTMLImageElement
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  }))).toBe(true)
  for (const image of await images.all()) {
    await expect(image).toHaveAttribute('alt')
    const decorative = await image.evaluate(element => Boolean(element.closest('[aria-hidden="true"]')))
    if (decorative) await expect(image).toHaveAttribute('alt', '')
    else {
      const accessibleText = await image.evaluate(element =>
        element.getAttribute('alt')?.trim()
        || element.closest('[role="img"][aria-label]')?.getAttribute('aria-label')?.trim(),
      )
      expect(accessibleText?.length).toBeGreaterThan(0)
    }
  }
})

test('常见问题可鼠标与键盘展开收起，内容不依赖后台请求', async ({ page }) => {
  await page.goto('/')
  const question = page.locator('#faq details').filter({ hasText: '批量演示等于真实账号并发执行吗？' })
  const summary = question.locator('summary')
  await summary.click()
  await expect(question).toHaveAttribute('open', '')
  await expect(question.locator('.faq-answer')).toBeVisible()
  await expect(question).toContainText(/50\s*个账号/)
  await expect(question).toContainText(/演示/)
  await expect(question).toContainText(/Windows[^。]*按账号顺序执行/)
  await expect(question).toContainText(/不支持多个真实账号同时自动运行/)
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(question).not.toHaveAttribute('open', '')
  await expect(question.locator('.faq-answer')).toBeHidden()
  await page.keyboard.press('Space')
  await expect(question).toHaveAttribute('open', '')
})

test('滚动显现实际经过中间动画帧，仅使用透明度和位移过渡', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.locator('.landing')).toHaveClass(/motion-ready/)
  await expect.poll(() => page.locator('[data-reveal]').evaluateAll(elements => elements.some(element =>
    element.getBoundingClientRect().top > innerHeight * 2 && Number(getComputedStyle(element).opacity) < 1,
  ))).toBe(true)
  const result = await page.evaluate(async () => {
    const target = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].find(element =>
      element.getBoundingClientRect().top > innerHeight * 2 && Number(getComputedStyle(element).opacity) < 1,
    )
    if (!target) throw new Error('Expected a not-yet-revealed offscreen section')
    const before = getComputedStyle(target)
    const transition = { property: before.transitionProperty, duration: before.transitionDuration }
    target.scrollIntoView({ behavior: 'instant', block: 'center' })
    const frames: Array<{ milliseconds: number; opacity: number; transform: string }> = []
    const start = performance.now()
    await new Promise<void>(resolve => {
      const sample = () => {
        const style = getComputedStyle(target)
        const elapsed = performance.now() - start
        frames.push({ milliseconds: Math.round(elapsed), opacity: Number(style.opacity), transform: style.transform })
        if (elapsed >= 1_200) resolve()
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    return { transition, frames }
  })
  expect(result.transition.property.split(',').map(value => value.trim()).sort()).toEqual(['opacity', 'transform'])
  expect(result.transition.duration.split(',').some(value => Number.parseFloat(value) > 0)).toBe(true)
  expect(result.frames.some(frame => frame.opacity > 0 && frame.opacity < 1)).toBe(true)
  expect(result.frames.at(-1)?.opacity).toBe(1)
  expect(new Set(result.frames.map(frame => frame.transform)).size).toBeGreaterThan(2)
  const motionPath = testInfo.outputPath('scroll-reveal-motion.json')
  await writeFile(motionPath, JSON.stringify(result, null, 2), 'utf8')
  await testInfo.attach('scroll-reveal-motion.json', { path: motionPath, contentType: 'application/json' })
})

test('品牌入场有实际中间帧且不会无限循环，暂停与恢复使用真实动画状态', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const art = page.getByTestId('brand-hero-art')
  await expect(art).toBeVisible()
  const pause = page.getByRole('button', { name: '暂停品牌动效', exact: true })
  await expect(pause).toHaveAttribute('aria-pressed', 'false')
  await pause.click()
  const resume = page.getByRole('button', { name: '播放品牌动效', exact: true })
  await expect(resume).toHaveAttribute('aria-pressed', 'true')
  const paused = await art.evaluate(async element => {
    const animations = element.getAnimations({ subtree: true })
    const before = animations.map(animation => animation.currentTime)
    const start = performance.now()
    await new Promise<void>(resolve => {
      const sample = () => performance.now() - start >= 180 ? resolve() : requestAnimationFrame(sample)
      requestAnimationFrame(sample)
    })
    return {
      count: animations.length,
      stable: animations.every((animation, index) => animation.currentTime === before[index]),
      states: animations.map(animation => animation.playState),
    }
  })
  expect(paused.count).toBeGreaterThan(0)
  expect(paused.stable).toBe(true)
  expect(paused.states.every(state => state === 'paused' || state === 'finished')).toBe(true)
  await resume.click()
  await expect(pause).toHaveAttribute('aria-pressed', 'false')
  const result = await art.evaluate(async element => {
    const animations = element.getAnimations({ subtree: true })
    const timings = animations.map(animation => animation.effect?.getTiming())
    const frames: Array<{ milliseconds: number; progress: Array<number | null> }> = []
    const start = performance.now()
    await new Promise<void>(resolve => {
      const sample = () => {
        const elapsed = performance.now() - start
        frames.push({ milliseconds: Math.round(elapsed), progress: animations.map(animation => animation.effect?.getComputedTiming().progress ?? null) })
        if (elapsed >= 800) resolve()
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    return { timings, frames }
  })
  expect(result.timings.every(timing => timing?.iterations === 1)).toBe(true)
  expect(result.frames.some(frame => frame.progress.some(progress => progress !== null && progress > 0 && progress < 1))).toBe(true)
  expect(new Set(result.frames.map(frame => JSON.stringify(frame.progress))).size).toBeGreaterThan(2)
  await expect.poll(() => art.evaluate(element => element.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'))).toBe(false)
  const replay = page.getByRole('button', { name: '重播品牌动效', exact: true })
  await expect(replay).toBeVisible()
  await replay.click()
  await expect(pause).toHaveAttribute('aria-pressed', 'false')
  const replayProgress = await art.evaluate(async element => {
    const frames: Array<Array<number | null>> = []
    const start = performance.now()
    await new Promise<void>(resolve => {
      const sample = () => {
        frames.push(element.getAnimations({ subtree: true }).map(animation => animation.effect?.getComputedTiming().progress ?? null))
        if (performance.now() - start >= 400) resolve()
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    return frames
  })
  expect(replayProgress.some(frame => frame.some(progress => progress !== null && progress > 0 && progress < 1))).toBe(true)
  expect(new Set(replayProgress.map(frame => JSON.stringify(frame))).size).toBeGreaterThan(2)
  const motionPath = testInfo.outputPath('brand-entrance-motion.json')
  await writeFile(motionPath, JSON.stringify({ paused, ...result, replayProgress }, null, 2), 'utf8')
  await testInfo.attach('brand-entrance-motion.json', { path: motionPath, contentType: 'application/json' })
  await expect.poll(() => art.evaluate(element => element.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'))).toBe(false)
})

test('暂停品牌动效不冻结下载中的加载反馈', async ({ page }) => {
  let respond: (() => Promise<void>) | undefined
  await page.route('**/updates/latest.yml*', route => {
    respond = () => route.fulfill({ status: 503, body: 'test-delayed-unavailable' })
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByRole('button', { name: '暂停品牌动效', exact: true }).click()
  await expect(page.locator('.landing')).toHaveClass(/motion-paused/)
  await page.locator('.hero-actions').first().getByRole('button', { name: /下载/ }).click()
  const spinner = page.locator('.download-spinner')
  await expect(spinner).toBeVisible()
  const loading = await spinner.evaluate(async element => {
    const frames: string[] = []
    const start = performance.now()
    await new Promise<void>(resolve => {
      const sample = () => {
        frames.push(getComputedStyle(element).transform)
        if (performance.now() - start >= 250) resolve()
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    return { frames, states: element.getAnimations().map(animation => animation.playState) }
  })
  expect(loading.states).toContain('running')
  expect(new Set(loading.frames).size).toBeGreaterThan(2)
  await expect(page.locator('.landing')).toHaveClass(/motion-paused/)
  expect(respond).toBeDefined()
  await respond!()
  await expect(page.getByRole('alert')).toContainText(/下载|安装包|重试/)
})

test('减少动态效果模式不隐藏内容、不保留位移，品牌动效不会运行', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.landing')).not.toHaveClass(/motion-ready/)
  const reveals = page.locator('[data-reveal]')
  expect(await reveals.count()).toBeGreaterThan(0)
  const styles = await reveals.evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element)
    return { opacity: style.opacity, transform: style.transform, transition: style.transitionDuration, animation: style.animationName }
  }))
  expect(styles.every(style => style.opacity === '1' && style.transform === 'none' && style.transition === '0s' && style.animation === 'none')).toBe(true)
  await expect.poll(() => page.getByTestId('brand-hero-art').evaluate(element =>
    element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
  )).toBe(0)
  await expect(page.getByRole('button', { name: '已减少动态效果', exact: true })).toBeDisabled()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '开始使用', exact: true }).click()
  await expect(page.locator('#workflow')).toBeInViewport()
})

test('运行中切换减少动态效果偏好会立即停止品牌动画并显示全部章节', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.locator('.landing')).toHaveClass(/motion-ready/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.landing')).not.toHaveClass(/motion-ready/)
  await expect.poll(() => page.locator('[data-reveal]').evaluateAll(elements => elements.every(element => {
    const style = getComputedStyle(element)
    return style.opacity === '1' && style.transform === 'none'
  }))).toBe(true)
  await expect.poll(() => page.getByTestId('brand-hero-art').evaluate(element =>
    element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
  )).toBe(0)
})

test('桌面端根入口仍进入授权登录，不显示官网', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'electronAPI', { value: {}, configurable: true }) })
  await page.goto('/')
  await expect(page).toHaveURL(/#\/user\/login$/)
  await expect(page.locator('#authCode')).toBeVisible()
  await expect(page.locator('.landing')).toHaveCount(0)
})

test('下载清单失败有反馈并允许重试，成功后下载当前正式安装包', async ({ page }) => {
  let attempts = 0
  await page.route('**/updates/latest.yml*', route => {
    attempts += 1
    return route.fulfill(attempts === 1
      ? { status: 503, body: 'unavailable' }
      : { status: 200, contentType: 'text/yaml', body: 'version: 1.8.5\npath: KST Setup 1.8.5.exe\n' })
  })
  await page.route('**/updates/*.exe', route => route.fulfill({
    status: 200,
    headers: { 'Content-Disposition': 'attachment; filename="KST-Setup-test.exe"' },
    contentType: 'application/octet-stream',
    body: 'test-download-only-not-an-executable',
  }))
  await page.goto('/')
  const downloadButton = page.locator('.hero-actions').first().getByRole('button', { name: /下载/ })
  await downloadButton.click()
  await expect(page.getByRole('alert')).toContainText(/下载|安装包|重试/)
  const download = page.waitForEvent('download')
  await downloadButton.click()
  expect((await download).suggestedFilename()).toBe('KST-Setup-test.exe')
  expect(attempts).toBe(2)
})

test('下载中所有入口共享忙碌状态，不重复请求清单', async ({ page }) => {
  let manifestRequests = 0
  let respond: (() => Promise<void>) | undefined
  await page.route('**/updates/latest.yml*', route => {
    manifestRequests += 1
    respond = () => route.fulfill({ status: 503, body: 'test-delayed-unavailable' })
  })
  await page.goto('/')
  await page.locator('.hero-actions').first().getByRole('button', { name: /下载/ }).click()
  await expect.poll(() => manifestRequests).toBe(1)
  const downloading = page.locator('button[aria-busy="true"]')
  await expect(downloading).toHaveCount(3)
  for (const button of await downloading.all()) {
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('aria-busy', 'true')
  }
  expect(manifestRequests).toBe(1)
  expect(respond).toBeDefined()
  await respond!()
  await expect(page.getByRole('alert')).toContainText(/下载|安装包|重试/)
  await expect(page.locator('.hero-actions').first().getByRole('button', { name: /重试/ })).toBeEnabled()
})
