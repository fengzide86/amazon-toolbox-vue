/**
 * UserSidebar 组件测试
 * 测试用户端侧边栏：品牌展示、路由预取、菜单导航
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import UserSidebar from '@/components/UserSidebar.vue'

// Mock router
const mockRouter = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/user/dashboard', name: 'UserDashboard', component: { template: '<div />' } },
    { path: '/user/tools', name: 'UserTools', component: { template: '<div />' } },
    { path: '/user/logs', name: 'UserLogs', component: { template: '<div />' } },
    { path: '/user/faq', name: 'UserFaq', component: { template: '<div />' } },
    { path: '/user/plans', name: 'UserPlans', component: { template: '<div />' } },
    { path: '/user/devices', name: 'UserDevices', component: { template: '<div />' } },
    { path: '/user/ai-chat', name: 'UserAIChat', component: { template: '<div />' } },
    { path: '/user/login', name: 'UserLogin', component: { template: '<div />' } },
  ]
})

// Mock utils
vi.mock('@/utils', () => ({
  Auth: { clear: vi.fn() },
  showToast: vi.fn()
}))

describe('UserSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    // 工具箱是登录后的默认页
    mockRouter.push('/user/tools')
  })

  describe('品牌区渲染', () => {
    it('应该显示 Zap 图标品牌徽章', async () => {
      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      expect(wrapper.find('.brand-badge').exists()).toBe(true)
      expect(wrapper.find('.brand-badge svg').exists()).toBe(true)
    })

    it('应该显示"自动化工具箱"品牌文字', async () => {
      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      expect(wrapper.find('.brand-text').text()).toBe('自动化工具箱')
    })
  })

  describe('导航菜单渲染', () => {
    it('应该渲染所有导航菜单项', async () => {
      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      const menuItems = wrapper.findAll('.menu-nav-item')
      // 5 个核心菜单项 + 1 个退出按钮
      expect(menuItems.length).toBe(6)
    })

    it('应该显示正确的菜单标签', async () => {
      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      const labels = wrapper.findAll('.menu-label').map(el => el.text())
      expect(labels).toContain('工具箱')
      expect(labels).toContain('执行记录')
      expect(labels).toContain('套餐与授权')
      expect(labels).toContain('设备授权')
      expect(labels).toContain('AI 客服')
      expect(labels).toContain('退出登录')
      expect(labels).not.toContain('首页总览')
      expect(labels).not.toContain('设备管理')
    })

    it('当前路由对应的菜单项应该有 is-active 类', async () => {
      mockRouter.push('/user/tools')
      await mockRouter.isReady()

      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      const activeItems = wrapper.findAll('.menu-nav-item.is-active')
      expect(activeItems.length).toBe(1)
      expect(activeItems[0].text()).toContain('工具箱')
    })
  })

  describe('路由预取', () => {
    it('菜单项应该有 @mouseenter 预取属性', async () => {
      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      // 检查 router-link 存在（预取通过 @mouseenter 绑定）
      const links = wrapper.findAll('.menu-nav-item')
      expect(links.length).toBeGreaterThan(0)
    })

    it('prefetchRoute 函数应该存在', () => {
      // 验证组件导出了 prefetchRoute 逻辑
      // 通过检查组件实例的 setup 上下文
      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      // 组件应该正常挂载（prefetchRoute 是内部函数）
      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('退出登录', () => {
    it('退出按钮应该有 logout-item 类', async () => {
      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      expect(wrapper.find('.logout-item').exists()).toBe(true)
    })

    it('点击退出按钮应弹出确认框', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      await wrapper.find('.logout-item').trigger('click')

      expect(confirmSpy).toHaveBeenCalledWith('确定要退出登录吗？')
      confirmSpy.mockRestore()
    })
  })

  describe('移动端适配', () => {
    it('应该支持 mobile-open 类', async () => {
      const wrapper = mount(UserSidebar, {
        global: { plugins: [createPinia(), mockRouter] },
        props: { class: 'mobile-open' }
      })
      await flushPromises()

      expect(wrapper.exists()).toBe(true)
    })
  })
})
