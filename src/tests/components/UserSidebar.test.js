/**
 * UserSidebar 组件测试
 * 测试用户侧边栏导航功能
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import UserSidebar from '@/components/UserSidebar.vue'

// Mock vue-router
const mockPush = vi.fn()
const mockRoute = { path: '/user/dashboard' }

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute
}))

// Mock utils
vi.mock('@/utils', () => ({
  Auth: { clear: vi.fn() },
  showToast: vi.fn()
}))

// Mock window.confirm
const mockConfirm = vi.fn()
global.confirm = mockConfirm

describe('UserSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoute.path = '/user/dashboard'
    mockConfirm.mockReturnValue(true)
  })

  describe('渲染测试', () => {
    it('应该正确渲染侧边栏', () => {
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      expect(wrapper.find('aside.sidebar').exists()).toBe(true)
      expect(wrapper.find('ul.sidebar-nav').exists()).toBe(true)
    })

    it('应该渲染所有导航链接', () => {
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const links = wrapper.findAll('a')
      expect(links.length).toBe(7) // 7个导航项（包含AI客服）
    })

    it('应该包含正确的导航项目', () => {
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const text = wrapper.text()
      expect(text).toContain('首页总览')
      expect(text).toContain('功能入口')
      expect(text).toContain('个人日志')
      expect(text).toContain('常见问题')
      expect(text).toContain('套餐价格')
      expect(text).toContain('设备管理')
      expect(text).toContain('AI 客服')
    })

    it('应该渲染退出登录按钮', () => {
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const logoutBtn = wrapper.find('.btn-logout')
      expect(logoutBtn.exists()).toBe(true)
      expect(logoutBtn.text()).toContain('退出登录')
    })
  })

  describe('导航链接测试', () => {
    it('应该正确设置各导航链接的路由地址', () => {
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const routerLinks = wrapper.findAllComponents(RouterLinkStub)
      const routes = routerLinks.map(link => link.props('to'))
      
      expect(routes).toContain('/user/dashboard')
      expect(routes).toContain('/user/tools')
      expect(routes).toContain('/user/logs')
      expect(routes).toContain('/user/faq')
      expect(routes).toContain('/user/plans')
      expect(routes).toContain('/user/devices')
      expect(routes).toContain('/user/ai-chat')
    })

    it('当前页面应该有 aria-current 属性标记 active', () => {
      mockRoute.path = '/user/tools'
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const routerLinks = wrapper.findAllComponents(RouterLinkStub)
      const toolsLink = routerLinks[1]
      expect(toolsLink.attributes('aria-current')).toBe('page')
    })

    it('当前页面应该有 aria-current 属性', () => {
      mockRoute.path = '/user/logs'
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const links = wrapper.findAll('a')
      const logsLink = links[2] // 第三个链接是个人日志
      expect(logsLink.attributes('aria-current')).toBe('page')
    })
  })

  describe('退出登录测试', () => {
    it('点击退出登录应该弹出确认框', async () => {
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const logoutBtn = wrapper.find('.btn-logout')
      await logoutBtn.trigger('click')
      
      expect(mockConfirm).toHaveBeenCalledWith('确定要退出登录吗？')
    })

    it('确认退出应该清除数据并跳转到用户登录页', async () => {
      mockConfirm.mockReturnValue(true)
      const { Auth, showToast } = await import('@/utils')
      
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const logoutBtn = wrapper.find('.btn-logout')
      await logoutBtn.trigger('click')
      
      expect(Auth.clear).toHaveBeenCalled()
      expect(localStorage.removeItem).toHaveBeenCalledWith('toolbox_role')
      expect(localStorage.removeItem).toHaveBeenCalledWith('toolbox_user')
      expect(showToast).toHaveBeenCalledWith('已退出登录', 'success')
      expect(mockPush).toHaveBeenCalledWith('/user/login')
    })

    it('取消退出不应该执行任何操作', async () => {
      mockConfirm.mockReturnValue(false)
      const { Auth } = await import('@/utils')
      
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const logoutBtn = wrapper.find('.btn-logout')
      await logoutBtn.trigger('click')
      
      expect(Auth.clear).not.toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  describe('无障碍测试', () => {
    it('侧边栏应该有正确的 aria-label', () => {
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      expect(wrapper.find('aside').attributes('aria-label')).toBe('用户导航')
    })

    it('退出按钮应该有 aria-label', () => {
      const wrapper = mount(UserSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const logoutBtn = wrapper.find('.btn-logout')
      expect(logoutBtn.attributes('aria-label')).toBe('退出登录')
    })
  })
})