/**
 * Breadcrumb 组件测试
 * 测试面包屑导航功能
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import Breadcrumb from '@/components/Breadcrumb.vue'

// Mock vue-router
const mockRoute = { 
  meta: { title: '数据总览' }
}

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => mockRoute
}))

describe('Breadcrumb', () => {
  describe('渲染测试', () => {
    it('应该正确渲染面包屑导航', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      expect(wrapper.find('nav.breadcrumb').exists()).toBe(true)
    })

    it('应该包含首页链接', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const homeLink = wrapper.find('a.breadcrumb-item')
      expect(homeLink.exists()).toBe(true)
      expect(homeLink.text()).toContain('首页')
    })

    it('应该显示当前页面标题', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const currentItem = wrapper.find('.breadcrumb-item.active')
      expect(currentItem.exists()).toBe(true)
      expect(currentItem.text()).toBe('数据总览')
    })

    it('应该包含分隔符', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const separator = wrapper.find('.breadcrumb-separator')
      expect(separator.exists()).toBe(true)
      expect(separator.text()).toBe('/')
    })
  })

  describe('路由 meta 测试', () => {
    it('应该正确显示路由 meta.title', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const currentItem = wrapper.find('.breadcrumb-item.active')
      expect(currentItem.text()).toBe('数据总览')
    })

    it('没有 meta.title 时应该显示"未知页面"', () => {
      // 临时修改 mock
      const originalMeta = mockRoute.meta
      mockRoute.meta = {}
      
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const currentItem = wrapper.find('.breadcrumb-item.active')
      expect(currentItem.text()).toBe('未知页面')
      
      // 恢复 mock
      mockRoute.meta = originalMeta
    })
  })

  describe('首页链接测试', () => {
    it('首页链接应该指向根路径', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const homeLink = wrapper.findComponent(RouterLinkStub)
      expect(homeLink.props('to')).toBe('/')
    })

    it('首页链接应该包含首页图标', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const homeLink = wrapper.find('a.breadcrumb-item')
      expect(homeLink.find('svg').exists()).toBe(true)
    })
  })

  describe('无障碍测试', () => {
    it('面包屑应该有正确的 aria-label', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      expect(wrapper.find('nav').attributes('aria-label')).toBe('面包屑导航')
    })

    it('当前页面项应该有 active class', () => {
      const wrapper = mount(Breadcrumb, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub
          }
        }
      })
      const currentItem = wrapper.find('.breadcrumb-item.active')
      expect(currentItem.exists()).toBe(true)
    })
  })
})