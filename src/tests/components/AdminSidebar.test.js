/**
 * AdminSidebar 组件测试
 * 测试管理员侧边栏导航功能
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import AdminSidebar from '@/components/AdminSidebar.vue'

// Mock vue-router
const mockPush = vi.fn()
const mockRoute = { path: '/admin/dashboard' }

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

describe('AdminSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoute.path = '/admin/dashboard'
    mockConfirm.mockReturnValue(true)
  })

  describe('渲染测试', () => {
    it('应该正确渲染侧边栏', () => {
      const wrapper = mount(AdminSidebar, {
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
      const wrapper = mount(AdminSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const links = wrapper.findAll('a')
      expect(links.length).toBe(10) // 10个导航项（包含公告管理）
    })

    it('应该包含正确的导航项目', () => {
      const wrapper = mount(AdminSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const text = wrapper.text()
      expect(text).toContain('数据总览')
      expect(text).toContain('授权码管理')
      expect(text).toContain('订单与套餐')
      expect(text).toContain('分润管理')
      expect(text).toContain('系统设置')
      expect(text).toContain('用户管理')
      expect(text).toContain('工单管理')
      expect(text).toContain('知识库管理')
      expect(text).toContain('AI 客服管理')
    })

    it('应该渲染退出登录按钮', () => {
      const wrapper = mount(AdminSidebar, {
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
      const wrapper = mount(AdminSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const routerLinks = wrapper.findAllComponents(RouterLinkStub)
      const routes = routerLinks.map(link => link.props('to'))
      
      expect(routes).toContain('/admin/dashboard')
      expect(routes).toContain('/admin/authcodes')
      expect(routes).toContain('/admin/orders')
      expect(routes).toContain('/admin/profit')
      expect(routes).toContain('/admin/settings')
      expect(routes).toContain('/admin/users')
      expect(routes).toContain('/admin/feedback')
      expect(routes).toContain('/admin/knowledge')
      expect(routes).toContain('/admin/ai-chat')
    })

    it('当前页面应该有 aria-current 属性标记 active', () => {
      mockRoute.path = '/admin/dashboard'
      const wrapper = mount(AdminSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      // isActive 函数检查 route.path === link path
      // 当路径匹配时，aria-current 应该为 'page'
      const routerLinks = wrapper.findAllComponents(RouterLinkStub)
      const dashboardLink = routerLinks[0]
      expect(dashboardLink.attributes('aria-current')).toBe('page')
    })

    it('当前页面应该有 aria-current 属性', () => {
      mockRoute.path = '/admin/authcodes'
      const wrapper = mount(AdminSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const links = wrapper.findAll('a')
      const authcodesLink = links[1]
      expect(authcodesLink.attributes('aria-current')).toBe('page')
    })
  })

  describe('退出登录测试', () => {
    it('点击退出登录应该弹出确认框', async () => {
      const wrapper = mount(AdminSidebar, {
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

    it('确认退出应该清除数据并跳转', async () => {
      mockConfirm.mockReturnValue(true)
      const { Auth, showToast } = await import('@/utils')
      
      const wrapper = mount(AdminSidebar, {
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
      expect(mockPush).toHaveBeenCalledWith('/admin/login')
    })

    it('取消退出不应该执行任何操作', async () => {
      mockConfirm.mockReturnValue(false)
      const { Auth, showToast } = await import('@/utils')
      
      const wrapper = mount(AdminSidebar, {
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
      const wrapper = mount(AdminSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      expect(wrapper.find('aside').attributes('aria-label')).toBe('管理员导航')
    })

    it('退出按钮应该有 aria-label', () => {
      const wrapper = mount(AdminSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const logoutBtn = wrapper.find('.btn-logout')
      expect(logoutBtn.attributes('aria-label')).toBe('退出登录')
    })

    it('SVG 图标应该有 aria-hidden 属性', () => {
      const wrapper = mount(AdminSidebar, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const svgs = wrapper.findAll('svg')
      svgs.forEach(svg => {
        expect(svg.attributes('aria-hidden')).toBe('true')
      })
    })
  })
})