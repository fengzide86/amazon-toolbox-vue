/**
 * DevicesView 组件测试
 * 测试设备管理页面：设备列表、解绑操作、空状态
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DevicesView from '@/views/user/DevicesView.vue'

// Mock API
vi.mock('@/utils/api', () => ({
  getMyDevices: vi.fn().mockResolvedValue([])
}))

// Mock utils
vi.mock('@/utils', () => ({
  showToast: vi.fn()
}))

describe('DevicesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    
    // 直接设置 localStorage（jsdom 提供）
    localStorage.setItem('toolbox_user', JSON.stringify({ 
      user_id: 1,
      max_devices: 3 
    }))
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('页面渲染', () => {
    it('应该显示页面标题', async () => {
      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      expect(wrapper.find('.page-title').exists()).toBe(true)
      expect(wrapper.find('.page-title').text()).toBe('设备管理')
    })

    it('应该显示设备数量提示', async () => {
      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      expect(wrapper.text()).toContain('每个授权码可绑定')
      expect(wrapper.text()).toContain('台设备')
    })
  })

  describe('设备列表', () => {
    it('应该渲染设备卡片', async () => {
      const { getMyDevices } = await import('@/utils/api')
      getMyDevices.mockResolvedValue([
        {
          id: 1,
          device_name: '我的电脑',
          device_id: 'device_001',
          created_at: '2024-01-01T00:00:00Z'
        }
      ])

      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      expect(wrapper.text()).toContain('我的电脑')
      expect(wrapper.text()).toContain('device_001')
    })

    it('应该显示绑定时间', async () => {
      const { getMyDevices } = await import('@/utils/api')
      getMyDevices.mockResolvedValue([
        {
          id: 1,
          device_name: '我的电脑',
          device_id: 'device_001',
          created_at: '2024-01-15T10:30:00Z'
        }
      ])

      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      expect(wrapper.text()).toContain('2024-01-15')
    })

    it('应该显示解绑按钮', async () => {
      const { getMyDevices } = await import('@/utils/api')
      getMyDevices.mockResolvedValue([
        {
          id: 1,
          device_name: '我的电脑',
          device_id: 'device_001',
          created_at: '2024-01-01T00:00:00Z'
        }
      ])

      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      const unbindBtn = wrapper.find('.unbind-btn')
      expect(unbindBtn.exists()).toBe(true)
      expect(unbindBtn.text()).toBe('解绑')
    })

    it('只有一个设备时解绑按钮应该禁用', async () => {
      const { getMyDevices } = await import('@/utils/api')
      getMyDevices.mockResolvedValue([
        {
          id: 1,
          device_name: '我的电脑',
          device_id: 'device_001',
          created_at: '2024-01-01T00:00:00Z'
        }
      ])

      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      const unbindBtn = wrapper.find('.unbind-btn')
      expect(unbindBtn.exists()).toBe(true)
      expect(unbindBtn.attributes('disabled')).toBeDefined()
    })

    it('多个设备时解绑按钮应该可用', async () => {
      const { getMyDevices } = await import('@/utils/api')
      getMyDevices.mockResolvedValue([
        {
          id: 1,
          device_name: '电脑1',
          device_id: 'device_001',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 2,
          device_name: '电脑2',
          device_id: 'device_002',
          created_at: '2024-01-02T00:00:00Z'
        }
      ])

      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      const unbindBtns = wrapper.findAll('.unbind-btn')
      expect(unbindBtns.length).toBeGreaterThan(0)
      expect(unbindBtns[0].attributes('disabled')).toBeUndefined()
    })
  })

  describe('空状态', () => {
    it('没有设备时应该显示空状态', async () => {
      const { getMyDevices } = await import('@/utils/api')
      getMyDevices.mockResolvedValue([])

      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('暂无绑定设备')
    })
  })

  describe('解绑操作', () => {
    it('点击解绑应该弹出确认框', async () => {
      const { getMyDevices } = await import('@/utils/api')
      getMyDevices.mockResolvedValue([
        {
          id: 1,
          device_name: '电脑1',
          device_id: 'device_001',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 2,
          device_name: '电脑2',
          device_id: 'device_002',
          created_at: '2024-01-02T00:00:00Z'
        }
      ])

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

    const unbindBtn = wrapper.find('.unbind-btn')
    await unbindBtn.trigger('click')

      expect(confirmSpy).toHaveBeenCalled()
      confirmSpy.mockRestore()
    })
  })

  describe('错误处理', () => {
    it('API 失败时应该显示错误提示', async () => {
      const { getMyDevices } = await import('@/utils/api')
      getMyDevices.mockRejectedValue(new Error('Network error'))

      const { showToast } = await import('@/utils')

      const wrapper = mount(DevicesView, {
        global: { plugins: [createPinia()] }
      })
      await flushPromises()

      expect(showToast).toHaveBeenCalledWith('设备列表加载失败', 'error')
    })
  })
})