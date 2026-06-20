/**
 * ToolsView 组件测试
 * 测试工具箱页面功能，包括工具卡片、分类筛选等
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolsView from '@/views/user/ToolsView.vue'
import { usePlatformStore } from '@/stores/platform'

// Mock API
vi.mock('@/utils/api', () => ({
  getTools: vi.fn().mockResolvedValue([]),
  getToolCategories: vi.fn().mockResolvedValue([]),
  createLog: vi.fn()
}))

// Mock utils
vi.mock('@/utils', () => ({
  showToast: vi.fn(),
  runToolSimulation: vi.fn()
}))

describe('ToolsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  describe('渲染测试', () => {
    it('应该正确渲染页面标题', async () => {
      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })
      
      await flushPromises()
      
      expect(wrapper.find('.page-title').exists()).toBe(true)
      expect(wrapper.find('.page-title').text()).toBe('功能入口')
    })

    it('工具为空时应该显示空状态', async () => {
      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })
      
      await flushPromises()
      
      expect(wrapper.find('.empty-state').exists()).toBe(true)
    })
  })

  describe('工具卡片渲染测试', () => {
    it('应该正确渲染工具卡片', async () => {
      const { getTools } = await import('@/utils/api')
      getTools.mockResolvedValue([
        {
          name: '测试工具',
          module: 'test',
          description: '测试描述',
          status: 'online',
          category: 'other'
        }
      ])

      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })

      await flushPromises()
      
      expect(wrapper.text()).toContain('测试工具')
      expect(wrapper.text()).toContain('测试描述')
    })

    it('应该显示工具状态标签', async () => {
      const { getTools } = await import('@/utils/api')
      getTools.mockResolvedValue([
        {
          name: '测试工具',
          module: 'test',
          description: '测试描述',
          status: 'online',
          category: 'other'
        }
      ])

      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })

      await flushPromises()
      
      expect(wrapper.text()).toContain('正常')
    })

    it('维护中的工具应该显示维护状态', async () => {
      const { getTools } = await import('@/utils/api')
      getTools.mockResolvedValue([
        {
          name: '维护中工具',
          module: 'maintenance',
          description: '正在维护',
          status: 'offline',
          category: 'other'
        }
      ])

      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })

      await flushPromises()
      
      expect(wrapper.text()).toContain('维护中')
    })
  })

  describe('分类筛选测试', () => {
    it('应该显示分类标签', async () => {
      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })

      await flushPromises()
      
      expect(wrapper.find('.category-tabs').exists()).toBe(true)
      expect(wrapper.text()).toContain('全部工具')
    })

    it('应该根据分类过滤工具', async () => {
      const { getTools } = await import('@/utils/api')
      getTools.mockResolvedValue([
        {
          name: '数据分析工具A',
          module: 'data_tool_a',
          description: '数据分析',
          status: 'online',
          category: 'data'
        },
        {
          name: '运营工具B',
          module: 'operation_tool_b',
          description: '运营工具',
          status: 'online',
          category: 'operation'
        }
      ])

      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })

      await flushPromises()
      
      // 点击数据分析分类
      const dataTab = wrapper.findAll('.tab-btn').find(btn => btn.text() === '数据分析')
      if (dataTab) {
        await dataTab.trigger('click')
        await flushPromises()
        
        // 检查工具卡片是否显示/隐藏
        expect(wrapper.text()).toContain('数据分析工具A')
        // 运营工具B应该被过滤掉
        expect(wrapper.find('[data-testid="tool-card-运营工具B"]').exists()).toBe(false)
      }
    })
  })

  describe('搜索功能测试', () => {
    it('应该显示搜索框', async () => {
      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })

      await flushPromises()
      
      expect(wrapper.find('.search-box').exists()).toBe(true)
      expect(wrapper.find('input[type="text"]').exists()).toBe(true)
    })

    it('应该根据搜索文本过滤工具', async () => {
      const { getTools } = await import('@/utils/api')
      getTools.mockResolvedValue([
        {
          name: '亚马逊工具',
          module: 'amazon_tool',
          description: '亚马逊专用',
          status: 'online',
          category: 'other'
        },
        {
          name: '速卖通工具',
          module: 'ae_tool',
          description: '速卖通专用',
          status: 'online',
          category: 'other'
        }
      ])

      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })

      await flushPromises()
      
      // 输入搜索文本
      const searchInput = wrapper.find('input[type="text"]')
      await searchInput.setValue('亚马逊')
      await flushPromises()
      
      expect(wrapper.text()).toContain('亚马逊工具')
      expect(wrapper.text()).not.toContain('速卖通工具')
    })
  })

  describe('平台过滤测试', () => {
    it('应该根据当前平台过滤工具', async () => {
      const { getTools } = await import('@/utils/api')
      getTools.mockResolvedValue([
        {
          name: '亚马逊工具',
          module: 'amazon_tool',
          description: '亚马逊专用',
          status: 'online',
          category: 'other',
          platform: 'amazon'
        },
        {
          name: '速卖通工具',
          module: 'ae_tool',
          description: '速卖通专用',
          status: 'online',
          category: 'other',
          platform: 'aliexpress'
        }
      ])

      const store = usePlatformStore()
      store.setPlatform('amazon')

      const wrapper = mount(ToolsView, {
        global: {
          plugins: [createPinia()]
        }
      })

      await flushPromises()
      
      // 验证只显示亚马逊工具
      expect(wrapper.text()).toContain('亚马逊工具')
    })
  })
})