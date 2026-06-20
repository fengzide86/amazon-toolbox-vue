# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v1.5-rc1-ui.spec.js >> 工单提交验收 >> 工单页面加载
- Location: tests\e2e\v1.5-rc1-ui.spec.js:91:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 60000ms exceeded.
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e7]:
    - img [ref=e10]
    - heading "亚马逊赛训效率工具箱" [level=1] [ref=e12]
    - paragraph [ref=e13]: 比赛 · 实训 · 交付
    - paragraph [ref=e18]:
      - text: 面向亚马逊赛训与跨境电商实训场景
      - text: 提供轻量化效率工具，提升操作效率
    - generic [ref=e19]:
      - generic [ref=e20]:
        - generic [ref=e21]:
          - generic [ref=e22]: "90"
          - generic [ref=e23]: "%"
        - generic [ref=e25]: 操作提效 · 一键完成物料/发货
      - generic [ref=e26]:
        - generic [ref=e27]:
          - generic [ref=e28]: "10"
          - generic [ref=e29]: x
        - generic [ref=e31]: 上品速度 · 批量处理告别手动
      - generic [ref=e32]:
        - generic [ref=e33]:
          - generic [ref=e34]: "24"
          - generic [ref=e35]: h
        - generic [ref=e37]: AI 客服 · 问题秒级响应
    - generic [ref=e38]:
      - generic [ref=e39]:
        - img [ref=e40]
        - text: 自动上品
      - generic [ref=e42]:
        - img [ref=e43]
        - text: 物流模板
      - generic [ref=e45]:
        - img [ref=e46]
        - text: 自动发货
      - generic [ref=e48]:
        - img [ref=e49]
        - text: FBA/AGL
      - generic [ref=e51]:
        - img [ref=e52]
        - text: 广告脚本
      - generic [ref=e54]:
        - img [ref=e55]
        - text: 批量操作
  - generic [ref=e57]:
    - generic [ref=e58]:
      - generic [ref=e60]:
        - img [ref=e62]
        - heading "授权码登录" [level=2] [ref=e64]
        - paragraph [ref=e65]: 请输入授权码激活您的工具箱
      - generic [ref=e66]:
        - img [ref=e67]
        - generic [ref=e69]: 该授权码席位数已满(10席)，请联系管理员升级
      - generic [ref=e72]: 服务连接中...
      - generic [ref=e73]:
        - generic [ref=e74]:
          - generic [ref=e75]: 授权码
          - generic [ref=e76]:
            - generic:
              - img
            - textbox "授权码" [ref=e77]:
              - /placeholder: 请输入您的授权码
              - text: TEST-E2E-AMZ
        - generic [ref=e78]:
          - img [ref=e79]
          - generic [ref=e81]:
            - text: 已检测到设备：
            - strong [ref=e82]: DESKTOP-96AX3B
        - button "验证并登录 验证中..." [ref=e83] [cursor=pointer]:
          - generic [ref=e84]:
            - img [ref=e85]
            - text: 验证并登录
          - generic [ref=e87]:
            - img [ref=e88]
            - text: 验证中...
      - navigation "其他操作" [ref=e90]:
        - link "使用帮助" [ref=e91] [cursor=pointer]:
          - /url: "#"
          - img [ref=e92]
          - text: 使用帮助
        - link "联系客服" [ref=e95] [cursor=pointer]:
          - /url: "#"
          - img [ref=e96]
          - text: 联系客服
        - link "服务条款" [ref=e99] [cursor=pointer]:
          - /url: "#/user/terms"
          - img [ref=e100]
          - text: 服务条款
        - link "管理员登录" [ref=e103] [cursor=pointer]:
          - /url: "#/admin/login"
          - img [ref=e104]
          - text: 管理员登录
    - paragraph [ref=e107]: © 2026 亚马逊赛训效率工具箱 · 专业 · 高效 · 可信赖
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | import { join, dirname } from 'path'
  3   | import { fileURLToPath } from 'url'
  4   | 
  5   | const __dirname = dirname(fileURLToPath(import.meta.url))
  6   | const FRONTEND_URL = 'http://localhost:3000'
  7   | const ADMIN_STATE_FILE = join(__dirname, '..', '..', 'test-results', 'admin-state.json')
  8   | 
  9   | // E2E 专用测试授权码（由 backend/test_data_e2e.py 创建）
  10  | const TEST_E2E_AMZ = 'TEST-E2E-AMZ'
  11  | const TEST_E2E_AE = 'TEST-E2E-AE'
  12  | 
  13  | // Helper: clear auth state
  14  | async function clearAuth(page) {
  15  |   await page.goto(`${FRONTEND_URL}/#/user/login`)
  16  |   await page.waitForLoadState('networkidle')
  17  |   await page.evaluate(() => {
  18  |     localStorage.clear()
  19  |   })
  20  | }
  21  | 
  22  | // Helper: login as user with auth code
  23  | async function loginUser(page, authCode) {
  24  |   await page.goto(`${FRONTEND_URL}/#/user/login`)
  25  |   await page.waitForLoadState('networkidle')
  26  | 
  27  |   const authInput = page.locator('#authCode')
  28  |   await authInput.fill(authCode)
  29  | 
  30  |   const loginResponsePromise = page.waitForResponse(
  31  |     (resp) => resp.url().includes('/api/auth/verify') && resp.request().method() === 'POST',
  32  |     { timeout: 15000 }
  33  |   )
  34  | 
  35  |   await page.locator('button[type="submit"]').click()
  36  |   const resp = await loginResponsePromise
  37  |   expect(resp.status()).toBe(200)
  38  | 
> 39  |   await page.waitForFunction(() => {
      |              ^ Error: page.waitForFunction: Test timeout of 60000ms exceeded.
  40  |     return localStorage.getItem('toolbox_auth') !== null
  41  |   }, { timeout: 10000 })
  42  | 
  43  |   await expect(page.getByTestId('user-layout')).toBeVisible({ timeout: 15000 })
  44  |   await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 10000 })
  45  | }
  46  | 
  47  | // ===========================
  48  | // 用户端测试（每个用例独立登录）
  49  | // ===========================
  50  | test.describe('用户端 AMZ 验收', () => {
  51  |   test('AMZ 登录并验证首页和工具箱', async ({ page }) => {
  52  |     await clearAuth(page)
  53  |     await loginUser(page, TEST_E2E_AMZ)
  54  | 
  55  |     await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 5000 })
  56  |     await page.screenshot({ path: 'test-results/screenshots/user-amz-dashboard.png', fullPage: true })
  57  |     await expect(page.getByTestId('platform-switcher')).toBeVisible({ timeout: 5000 })
  58  | 
  59  |     await page.goto(`${FRONTEND_URL}/#/user/tools`)
  60  |     await page.waitForLoadState('networkidle')
  61  |     await expect(page.locator('.tool-card', { hasText: '物流模板标准版' })).toBeVisible({ timeout: 15000 })
  62  |     await page.screenshot({ path: 'test-results/screenshots/user-amz-tools.png', fullPage: true })
  63  |   })
  64  | })
  65  | 
  66  | test.describe('用户端 AE 验收', () => {
  67  |   test('AE 登录并验证工具箱', async ({ page }) => {
  68  |     await clearAuth(page)
  69  |     await loginUser(page, TEST_E2E_AE)
  70  | 
  71  |     await page.goto(`${FRONTEND_URL}/#/user/tools`)
  72  |     await page.waitForLoadState('networkidle')
  73  |     await expect(page.locator('.tool-card', { hasText: '物流模板标准版' })).toBeVisible({ timeout: 15000 })
  74  |     await page.screenshot({ path: 'test-results/screenshots/user-ae-tools.png', fullPage: true })
  75  |   })
  76  | })
  77  | 
  78  | test.describe('FAQ 页面验收', () => {
  79  |   test('FAQ 页面加载', async ({ page }) => {
  80  |     await clearAuth(page)
  81  |     await loginUser(page, TEST_E2E_AMZ)
  82  | 
  83  |     await page.goto(`${FRONTEND_URL}/#/user/faq`)
  84  |     await page.waitForLoadState('networkidle')
  85  |     await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 5000 })
  86  |     await page.screenshot({ path: 'test-results/screenshots/user-faq.png', fullPage: true })
  87  |   })
  88  | })
  89  | 
  90  | test.describe('工单提交验收', () => {
  91  |   test('工单页面加载', async ({ page }) => {
  92  |     await clearAuth(page)
  93  |     await loginUser(page, TEST_E2E_AMZ)
  94  | 
  95  |     await page.goto(`${FRONTEND_URL}/#/user/logs`)
  96  |     await page.waitForLoadState('networkidle')
  97  |     await expect(page.getByTestId('user-content')).toBeVisible({ timeout: 5000 })
  98  |     await page.screenshot({ path: 'test-results/screenshots/user-feedback-submit.png', fullPage: true })
  99  |   })
  100 | })
  101 | 
  102 | test.describe('用户端平台切换验收', () => {
  103 |   test('用户端平台切换按钮点击有效', async ({ page }) => {
  104 |     await clearAuth(page)
  105 |     await loginUser(page, TEST_E2E_AMZ)
  106 | 
  107 |     // 等待平台切换器可见
  108 |     const platformSwitcher = page.getByTestId('platform-switcher')
  109 |     await expect(platformSwitcher).toBeVisible({ timeout: 5000 })
  110 | 
  111 |     // 获取当前选中的平台按钮
  112 |     const activeBtn = platformSwitcher.locator('button.active')
  113 |     const activeText = await activeBtn.textContent()
  114 |     console.log(`当前选中平台：${activeText}`)
  115 | 
  116 |     // 点击另一个平台按钮
  117 |     const buttons = platformSwitcher.locator('button.platform-btn:not(.disabled)')
  118 |     const buttonCount = await buttons.count()
  119 |     
  120 |     if (buttonCount > 1) {
  121 |       // 点击第一个非当前选中的按钮
  122 |       for (let i = 0; i < buttonCount; i++) {
  123 |         const btn = buttons.nth(i)
  124 |         const btnText = await btn.textContent()
  125 |         if (btnText !== activeText) {
  126 |           await btn.click()
  127 |           await page.waitForTimeout(500)
  128 |           
  129 |           // 验证按钮状态已切换
  130 |           const newActiveBtn = platformSwitcher.locator('button.active')
  131 |           const newActiveText = await newActiveBtn.textContent()
  132 |           console.log(`切换后平台：${newActiveText}`)
  133 |           
  134 |           // 验证 localStorage 已更新
  135 |           const storedPlatform = await page.evaluate(() => localStorage.getItem('toolbox_current_platform'))
  136 |           console.log(`localStorage 中的平台：${storedPlatform}`)
  137 |           
  138 |           break
  139 |         }
```