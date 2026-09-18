import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test.use({ trace: 'on' })

async function openNavigationIfCollapsed(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: '打开导航', exact: true })
  if (await toggle.isVisible()) await toggle.click()
}

async function revealPageSections(page: Page): Promise<void> {
  for (const element of await page.locator('[data-reveal]').all()) {
    await element.scrollIntoViewIfNeeded()
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
    await expect(page.locator('h1')).toContainText('把节奏留给自己')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`landing-hero-${width}.png`) })
    await revealPageSections(page)
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: true })
    await openNavigationIfCollapsed(page)
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '产品能力' }).click()
    await expect(page).toHaveURL(/#\/#capabilities$/)
    await expect(page.locator('#capabilities')).toBeInViewport()
    await expect(page.locator('.landing')).toBeVisible()
    expect(errors).toEqual([])
  })
}

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
  const link = page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '产品能力', exact: true })
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
  await navigation.getByRole('link', { name: '产品能力', exact: true }).click()
  await expect(page).toHaveURL(/#\/#capabilities$/)
  await navigation.getByRole('link', { name: '使用流程', exact: true }).click()
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
  await navigation.getByRole('link', { name: '产品能力', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(navigation).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await navigation.getByRole('link', { name: '常见问题', exact: true }).click()
  await expect(page).toHaveURL(/#\/#faq$/)
  await expect(navigation).toBeHidden()
  await expect(page.locator('#faq')).toBeInViewport()
})

test.describe('官网产品预览交互记录', () => {
  test('产品预览支持键盘切换、真实详情响应，不触发业务请求', async ({ page }, testInfo) => {
    await page.goto('/')
    const preview = page.getByTestId('landing-product-preview')
    await expect(preview).toBeVisible()
    const requests: string[] = []
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
    })
    const business = preview.getByRole('tab', { name: '批量工作台', exact: true })
    const consumer = preview.getByRole('tab', { name: '个人工具箱', exact: true })
    await expect(business).toHaveAttribute('aria-selected', 'true')
    await business.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(consumer).toBeFocused()
    await expect(consumer).toHaveAttribute('aria-selected', 'true')
    await expect(business).toHaveAttribute('tabindex', '-1')
    await expect(preview.getByRole('tabpanel', { name: '个人工具箱', exact: true })).toBeVisible()
    await expect(preview.getByRole('tabpanel')).toHaveCount(1)
    await expect(preview.getByRole('tabpanel')).toHaveCSS('opacity', '1')
    await preview.screenshot({ path: testInfo.outputPath('landing-preview-consumer.png') })
    await page.keyboard.press('End')
    await expect(business).toBeFocused()
    await expect(preview.getByRole('tabpanel', { name: '批量工作台', exact: true })).toBeVisible()
    await page.keyboard.press('Home')
    await expect(consumer).toBeFocused()
    await expect(preview.getByRole('tabpanel', { name: '个人工具箱', exact: true })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(business).toBeFocused()
    const panel = preview.getByRole('tabpanel', { name: '批量工作台', exact: true })
    await expect(panel).toBeVisible()
    const detail = preview.getByTestId('preview-account-detail')
    for (const account of [
      { number: '01', status: '运行中', detail: '模板准备' },
      { number: '02', status: '已完成', detail: '本项模拟流程已结束' },
      { number: '03', status: '需关注', detail: '等待用户确认' },
    ]) {
      const row = panel.getByRole('button', { name: `查看演示账号 ${account.number}的${account.status}示意详情`, exact: true })
      await row.click()
      await expect(row).toHaveAttribute('aria-pressed', 'true')
      await expect(panel.locator('button[aria-pressed="true"]')).toHaveCount(1)
      await expect(detail).toContainText(`演示账号 ${account.number}`)
      await expect(detail).toContainText(account.detail)
    }
    await expect(detail.locator('.detail-body')).toHaveCSS('opacity', '1')
    await preview.screenshot({ path: testInfo.outputPath('landing-preview-business-detail.png') })
    expect(requests).toEqual([])
  })
})

test('手机上的账号详情保持可操作，切换 C 端后无横向溢出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const preview = page.getByTestId('landing-product-preview')
  await preview.getByRole('button', { name: '查看演示账号 01的运行中示意详情', exact: true }).click()
  const detail = preview.getByTestId('preview-account-detail')
  await detail.scrollIntoViewIfNeeded()
  await expect(detail).toBeInViewport()
  await expect(detail).toContainText('演示账号 01')
  await detail.screenshot({ path: testInfo.outputPath('landing-mobile-account-detail.png') })
  await preview.getByRole('tab', { name: '个人工具箱', exact: true }).click()
  await expect(preview.getByRole('tabpanel', { name: '个人工具箱', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

test('常见问题可鼠标与键盘展开收起，内容不依赖后台请求', async ({ page }) => {
  await page.goto('/')
  const question = page.locator('#faq details').filter({ hasText: '批量演示等于真实账号并发执行吗？' })
  const summary = question.locator('summary')
  await summary.click()
  await expect(question).toHaveAttribute('open', '')
  await expect(question.locator('.faq-answer')).toBeVisible()
  await expect(question).toContainText('50 个账号的逻辑并发演示')
  await expect(question).toContainText('单 Runner 顺序执行')
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
    element.getBoundingClientRect().top > innerHeight * 2 && getComputedStyle(element).opacity === '0',
  ))).toBe(true)
  const result = await page.evaluate(async () => {
    const target = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].find(element =>
      element.getBoundingClientRect().top > innerHeight * 2 && getComputedStyle(element).opacity === '0',
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
  const process = page.locator('.process-illustration')
  await process.scrollIntoViewIfNeeded()
  await expect(process).toHaveClass(/is-visible/)
  const connector = process.locator('.process-connector span').first()
  await expect(connector).toHaveCSS('animation-iteration-count', '2')
  await expect(connector).toHaveCSS('animation-duration', '2.2s')
  await expect.poll(() => connector.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(false)
})

test('减少动态效果模式不隐藏内容、不保留位移，切换标签仍立即可用', async ({ page }) => {
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
  const preview = page.getByTestId('landing-product-preview')
  await preview.getByRole('tab', { name: '个人工具箱', exact: true }).click()
  await expect(preview.getByRole('tabpanel', { name: '个人工具箱', exact: true })).toHaveCSS('opacity', '1')
  await expect(preview.getByRole('tabpanel')).toHaveCSS('transform', 'none')
  await expect(preview.getByRole('tabpanel')).toHaveCSS('transition-duration', '0s')
  await expect(page.locator('.process-connector span').first()).toHaveCSS('animation-name', 'none')
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
