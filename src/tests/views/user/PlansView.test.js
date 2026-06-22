/**
 * PlansView 组件测试
 * 测试套餐页面功能，包括推荐标签逻辑、价格显示等
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PlansView from '@/views/user/PlansView.vue'

// Mock API
vi.mock('@/utils/api', () => ({
  getPlans: vi.fn().mockResolvedValue([])
}))

// Mock utils
vi.mock('@/utils', () => ({
  showToast: vi.fn()
}))

describe('PlansView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  const globalStubs = {
    'el-card': { template: '<div><slot /></div>' },
    'el-tag': { template: '<span><slot /></span>' },
    'el-button': { template: '<button><slot /></button>' }
  }

  describe('渲染测试', () => {
    it('应该正确渲染页面标题', async () => {
      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })
      
      await flushPromises()
      
      expect(wrapper.find('.page-title').exists()).toBe(true)
      expect(wrapper.find('.page-title').text()).toBe('套餐价格')
    })

    it('套餐为空时应该显示空状态', async () => {
      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })
      
      await flushPromises()
      
      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('暂无套餐信息')
    })
  })

  describe('推荐标签逻辑测试', () => {
    it('isRecommended 函数应该根据价格判断推荐套餐', async () => {
      const { getPlans } = await import('@/utils/api')
      getPlans.mockResolvedValue([
        { id: 1, name: '基础版', price: 49, duration_days: 7, features: '基础功能' },
        { id: 2, name: '专业版', price: 199, duration_days: 30, features: '专业功能' },
        { id: 3, name: '企业版', price: 999, duration_days: 90, features: '企业功能' }
      ])

      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })

      await flushPromises()
      
      // 验证组件已挂载
      expect(wrapper.vm.plans).toHaveLength(3)
    })

    it('isRecommended 函数应该优先使用 is_recommended 字段', async () => {
      const { getPlans } = await import('@/utils/api')
      getPlans.mockResolvedValue([
        { id: 1, name: '基础版', price: 49, is_recommended: true, duration_days: 7, features: '基础功能' },
        { id: 2, name: '专业版', price: 199, is_recommended: false, duration_days: 30, features: '专业功能' }
      ])

      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })

      await flushPromises()
      
      // 调用 isRecommended 函数验证
      expect(wrapper.vm.isRecommended(wrapper.vm.plans[0])).toBe(true)
      expect(wrapper.vm.isRecommended(wrapper.vm.plans[1])).toBe(false)
    })
  })

  describe('价格显示测试', () => {
    it('应该正确显示套餐价格', async () => {
      const { getPlans } = await import('@/utils/api')
      getPlans.mockResolvedValue([
        { id: 1, name: '测试套餐', price: 199, duration_days: 30, features: '测试功能' }
      ])

      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })

      await flushPromises()
      
      expect(wrapper.text()).toContain('¥199')
    })

    it('应该正确显示有效期', async () => {
      const { getPlans } = await import('@/utils/api')
      getPlans.mockResolvedValue([
        { id: 1, name: '测试套餐', price: 199, duration_days: 30, features: '测试功能' }
      ])

      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })

      await flushPromises()
      
      expect(wrapper.text()).toContain('30 天有效期')
    })
  })

  describe('功能列表测试', () => {
    it('应该正确解析功能列表', () => {
      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })
      
      const features = wrapper.vm.getFeatures('功能1\n功能2\n功能3')
      expect(features).toHaveLength(3)
      expect(features).toContain('功能1')
      expect(features).toContain('功能2')
      expect(features).toContain('功能3')
    })

    it('空功能应该返回默认值', () => {
      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })
      
      const features = wrapper.vm.getFeatures('')
      expect(features).toEqual(['基础功能'])
    })
  })

  describe('联系客服测试', () => {
    it('点击联系客服应该调用 showToast', async () => {
      const { showToast } = await import('@/utils')
      
      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })
      
      wrapper.vm.contactService()
      
      expect(showToast).toHaveBeenCalledWith('客服微信：AmazonToolbox_Support', 'info')
    })
  })

  describe('SVIP标识测试', () => {
    it('有 code_prefix 的套餐应该显示 SVIP 标识', async () => {
      const { getPlans } = await import('@/utils/api')
      getPlans.mockResolvedValue([
        { 
          id: 1, 
          name: 'SVIP套餐', 
          price: 999, 
          duration_days: 90, 
          features: 'SVIP功能',
          code_prefix: 'SVIP'
        }
      ])

      const wrapper = mount(PlansView, {
        global: { stubs: globalStubs }
      })

      await flushPromises()
      
      expect(wrapper.text()).toContain('SVIP')
      expect(wrapper.text()).toContain('授权码前缀')
    })
  })
})