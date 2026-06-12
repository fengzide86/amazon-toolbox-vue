/**
 * AppHeader 组件测试
 * 测试应用顶部导航栏功能
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppHeader from '@/components/AppHeader.vue'

// Mock vue-router
const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ path: '/' })
}))

// Mock utils
vi.mock('@/utils', () => ({
  Auth: { clear: vi.fn() }
}))

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('渲染测试', () => {
    it('应该正确渲染头部导航', () => {
      const wrapper = mount(AppHeader)
      expect(wrapper.find('header.header').exists()).toBe(true)
      expect(wrapper.find('.header-inner').exists()).toBe(true)
    })

    it('应该显示应用标题', () => {
      const wrapper = mount(AppHeader)
      expect(wrapper.text()).toContain('亚马逊赛训效率工具箱')
    })

    it('应该显示汉堡菜单按钮', () => {
      const wrapper = mount(AppHeader)
      const hamburgerBtn = wrapper.find('.hamburger-btn')
      expect(hamburgerBtn.exists()).toBe(true)
    })

    it('应该显示 logo 图标', () => {
      const wrapper = mount(AppHeader)
      expect(wrapper.find('.logo-icon').exists()).toBe(true)
    })
  })

  describe('角色显示测试', () => {
    it('管理员模式应该显示 Owner 徽章', () => {
      const wrapper = mount(AppHeader, {
        props: { isAdmin: true }
      })
      expect(wrapper.find('.admin-badge').exists()).toBe(true)
      expect(wrapper.find('.admin-badge').text()).toBe('Owner')
    })

    it('管理员模式应该显示"管理员"文字', () => {
      const wrapper = mount(AppHeader, {
        props: { isAdmin: true }
      })
      expect(wrapper.find('.admin-name').text()).toBe('管理员')
    })

    it('用户模式不应该显示 Owner 徽章', () => {
      const wrapper = mount(AppHeader, {
        props: { isAdmin: false }
      })
      expect(wrapper.find('.admin-badge').exists()).toBe(false)
    })

    it('用户模式应该显示"用户"文字', () => {
      const wrapper = mount(AppHeader, {
        props: { isAdmin: false }
      })
      expect(wrapper.find('.admin-name').text()).toBe('用户')
    })

    it('管理员模式应该显示"管理后台"副标题', () => {
      const wrapper = mount(AppHeader, {
        props: { isAdmin: true }
      })
      expect(wrapper.text()).toContain('管理后台')
    })

    it('用户模式应该显示"用户中心"副标题', () => {
      const wrapper = mount(AppHeader, {
        props: { isAdmin: false }
      })
      expect(wrapper.text()).toContain('用户中心')
    })
  })

  describe('事件测试', () => {
    it('点击汉堡菜单按钮应该触发 toggle-sidebar 事件', async () => {
      const wrapper = mount(AppHeader)
      const hamburgerBtn = wrapper.find('.hamburger-btn')
      await hamburgerBtn.trigger('click')
      
      expect(wrapper.emitted('toggle-sidebar')).toBeTruthy()
      expect(wrapper.emitted('toggle-sidebar').length).toBe(1)
    })

    it('点击退出按钮应该清除数据并跳转', async () => {
      const { Auth } = await import('@/utils')
      
      const wrapper = mount(AppHeader)
      const logoutBtn = wrapper.find('.header-logout-btn')
      await logoutBtn.trigger('click')
      
      expect(Auth.clear).toHaveBeenCalled()
      expect(localStorage.removeItem).toHaveBeenCalledWith('toolbox_role')
      expect(mockPush).toHaveBeenCalledWith('/user/login')
    })
  })

  describe('无障碍测试', () => {
    it('汉堡菜单按钮应该有 aria-label', () => {
      const wrapper = mount(AppHeader)
      const hamburgerBtn = wrapper.find('.hamburger-btn')
      expect(hamburgerBtn.attributes('aria-label')).toBe('打开导航菜单')
    })

    it('退出按钮应该有 title 属性', () => {
      const wrapper = mount(AppHeader)
      const logoutBtn = wrapper.find('.header-logout-btn')
      expect(logoutBtn.attributes('title')).toBe('退出登录')
    })
  })

  describe('Props 默认值测试', () => {
    it('isAdmin 默认值应该为 false', () => {
      const wrapper = mount(AppHeader)
      expect(wrapper.find('.admin-badge').exists()).toBe(false)
      expect(wrapper.find('.admin-name').text()).toBe('用户')
    })
  })
})