import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import LandingView from '@/views/LandingView.vue'
import { createMarketingRouter, marketingRoutes } from '@/marketing/router'
import { isMarketingSource, marketingHeaders, marketingRedirects, publicHttpsUrl } from '@/marketing/build-policy'

describe('independent marketing site', () => {
  let wrapper: VueWrapper | undefined
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })
  afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })

  it('has only home, terms and an actual not-found route', () => {
    const router = createMarketingRouter(createMemoryHistory())
    expect(marketingRoutes).toHaveLength(3)
    expect(router.resolve('/').name).toBe('Landing')
    expect(router.resolve('/terms').name).toBe('MarketingTerms')
    for (const target of ['/user/login', '/business/workspace', '/admin/login', '/anything']) {
      expect(router.resolve(target).name).toBe('MarketingNotFound')
    }
  })

  it('reuses the complete landing content without login links or browser-workspace promises', async () => {
    const router = createMarketingRouter(createMemoryHistory())
    await router.push('/')
    wrapper = mount(LandingView, { props: { marketingOnly: true }, global: { plugins: [router] } })
    for (const selector of ['#main-content', '#capabilities', '#audiences', '#workflow', '#faq', '.final-cta']) {
      expect(wrapper.find(selector).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="brand-hero-art"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/terms"]').exists()).toBe(true)
    expect(wrapper.findAll('a').some(link => /^\/(?:user|admin|business)(?:\/|$)/.test(link.attributes('href') || ''))).toBe(false)
    expect(wrapper.text()).not.toContain('已有授权可登录使用浏览器支持的管理与演示功能')
    await wrapper.find('[data-testid="consultation-trigger"]').trigger('click')
    expect(wrapper.find('dialog').text()).toContain('这是模拟咨询入口')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves the existing system landing behavior by default', async () => {
    const router = createMarketingRouter(createMemoryHistory())
    await router.push('/')
    wrapper = mount(LandingView, { global: { plugins: [router] } })
    expect(wrapper.find('a[href="/user/login"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/admin/login"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('已有授权可登录使用浏览器支持的管理与演示功能')
  })

  it('allows only marketing source modules and rejects application dependencies', () => {
    expect(isMarketingSource('src/views/LandingView.vue?vue&type=script')).toBe(true)
    expect(isMarketingSource('src/components/landing/LandingStoryScene.vue')).toBe(true)
    for (const source of ['src/main.ts', 'src/App.vue', 'src/router/index.ts', 'src/stores/user.ts', 'src/utils/api/index.ts', 'src/features/business/demo-coordinator.ts', 'src/views/admin/ExpensesView.vue']) {
      expect(isMarketingSource(source)).toBe(false)
    }
  })

  it('requires explicit stable public URLs, not local or internal acceptance artifacts', () => {
    expect(publicHttpsUrl('https://downloads.example.test/KST%20Setup%201.8.8.exe', 'download')).toContain('1.8.8.exe')
    expect(publicHttpsUrl(undefined, 'download', false)).toBe('')
    for (const value of [undefined, 'http://downloads.example.test/setup.exe', 'https://localhost/setup.exe', 'https://user:password@downloads.example.test/setup.exe', 'https://downloads.example.test/candidate-50f48d5/setup.exe', 'https://downloads.example.test/setup.exe?token=temporary']) {
      expect(() => publicHttpsUrl(value, 'download')).toThrow()
    }
    expect(marketingHeaders).toContain("connect-src 'none'")
    expect(marketingRedirects).toContain('/terms /index.html 200')
    expect(marketingRedirects).not.toContain('/* /index.html')
  })
})
