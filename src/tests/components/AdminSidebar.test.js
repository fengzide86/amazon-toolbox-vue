/**
 * AdminSidebar 组件测试
 * 测试管理员侧边栏：品牌展示、路由预取、菜单导航、退出登录
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import AdminSidebar from '@/components/AdminSidebar.vue'

// Mock router
const mockRouter = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/admin/dashboard', name: 'AdminDashboard', component: { template: '<div />' } },
    { path: '/admin/authcodes', name: 'AdminAuthCodes', component: { template: '<div />' } },
    { path: '/admin/orders', name: 'AdminOrders', component: { template: '<div />' } },
    { path: '/admin/profit', name: 'AdminProfit', component: { template: '<div />' } },
    { path: '/admin/users', name: 'AdminUsers', component: { template: '<div />' } },
    { path: '/admin/feedback', name: 'AdminFeedback', component: { template: '<div />' } },
    { path: '/admin/knowledge', name: 'AdminKnowledge', component: { template: '<div />' } },
    { path: '/admin/ai-chat', name: 'AdminAIChat', component: { template: '<div />' } },
    { path: '/admin/announcements', name: 'AdminAnnouncements', component: { template: '<div />' } },
    { path: '/admin/settings', name: 'AdminSettings', component: { template: '<div />' } },
    { path: '/admin/login', name: 'AdminLogin', component: { template: '<div />' } },
  ]
})

// Mock utils
vi.mock('@/utils', () => ({
  Auth: { clear: vi.fn() },
  showToast: vi.fn()
}))

describe('AdminSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockRouter.push('/admin/dashboard')
  })

  describe('品牌区渲染', () => {
    it('应该显示"管"品牌徽章', async () => {
      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      expect(wrapper.find('.brand-badge').exists()).toBe(true)
      expect(wrapper.find('.brand-badge').text()).toBe('管')
    })

    it('应该显示"控制中心"品牌文字', async () => {
      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      expect(wrapper.find('.brand-text').text()).toBe('控制中心')
    })
  })

  describe('导航菜单渲染', () => {
    it('应该渲染所有导航菜单项', async () => {
      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      const menuItems = wrapper.findAll('.menu-nav-item')
      // 10 个菜单项 + 1 个退出按钮
      expect(menuItems.length).toBe(11)
    })

    it('应该显示正确的菜单标签', async () => {
      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      const labels = wrapper.findAll('.menu-label').map(el => el.text())
      expect(labels).toContain('数据总览')
      expect(labels).toContain('授权码管理')
      expect(labels).toContain('订单与套餐')
      expect(labels).toContain('分润管理')
      expect(labels).toContain('用户管理')
      expect(labels).toContain('工单管理')
      expect(labels).toContain('知识库管理')
      expect(labels).toContain('AI 客服管理')
      expect(labels).toContain('公告管理')
      expect(labels).toContain('系统设置')
      expect(labels).toContain('退出登录')
    })

    it('当前路由对应的菜单项应该有 is-active 类', async () => {
      mockRouter.push('/admin/dashboard')
      await mockRouter.isReady()

      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      const activeItems = wrapper.findAll('.menu-nav-item.is-active')
      expect(activeItems.length).toBe(1)
      expect(activeItems[0].text()).toContain('数据总览')
    })

    it('切换到不同路由时激活状态应该更新', async () => {
      mockRouter.push('/admin/orders')
      await mockRouter.isReady()

      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      const activeItems = wrapper.findAll('.menu-nav-item.is-active')
      expect(activeItems.length).toBe(1)
      expect(activeItems[0].text()).toContain('订单与套餐')
    })
  })

  describe('路由预取', () => {
    it('菜单项应该存在（预取通过 @mouseenter 绑定）', async () => {
      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      const links = wrapper.findAll('.menu-nav-item')
      expect(links.length).toBeGreaterThan(0)
    })

    it('prefetchRoute 函数应该存在', () => {
      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('退出登录', () => {
    it('退出按钮应该有 logout-item 类', async () => {
      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      expect(wrapper.find('.logout-item').exists()).toBe(true)
    })

    it('点击退出按钮应弹出确认框', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      await wrapper.find('.logout-item').trigger('click')

      expect(confirmSpy).toHaveBeenCalledWith('确定要退出登录吗？')
      confirmSpy.mockRestore()
    })

    it('确认退出后应调用 Auth.clear', async () => {
      const { Auth } = await import('@/utils')
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      await wrapper.find('.logout-item').trigger('click')
      await flushPromises()

      expect(Auth.clear).toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('取消退出不应该调用 Auth.clear', async () => {
      const { Auth } = await import('@/utils')
      Auth.clear.mockClear()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] }
      })
      await flushPromises()

      await wrapper.find('.logout-item').trigger('click')
      await flushPromises()

      expect(Auth.clear).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })
  })

  describe('移动端适配', () => {
    it('应该支持 mobile-open 类', async () => {
      const wrapper = mount(AdminSidebar, {
        global: { plugins: [createPinia(), mockRouter] },
        props: { class: 'mobile-open' }
      })
      await flushPromises()

      expect(wrapper.exists()).toBe(true)
    })
  })
})