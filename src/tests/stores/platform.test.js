/**
 * Pinia Store 测试 - Platform Store
 * 测试平台状态管理、权限检查、平台切换等核心逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlatformStore } from '@/stores/platform'

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem(key) {
    return this.store[key] || null
  },
  setItem(key, value) {
    this.store[key] = value
  },
  clear() {
    this.store = {}
  }
}

// Mock fetch API
global.fetch = vi.fn()

describe('Platform Store', () => {
  beforeEach(() => {
    // 重置 Pinia 和 localStorage
    setActivePinia(createPinia())
    localStorageMock.clear()
    vi.clearAllMocks()
    
    // Mock localStorage
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    })
  })

  describe('初始化', () => {
    it('应该使用默认平台 amazon', () => {
      const store = usePlatformStore()
      expect(store.currentPlatform).toBe('amazon')
    })

    it('应该从 localStorage 恢复平台设置', () => {
      localStorageMock.setItem('toolbox_current_platform', 'aliexpress')
      const store = usePlatformStore()
      expect(store.currentPlatform).toBe('aliexpress')
    })

    it('应该默认管理端平台为 all', () => {
      const store = usePlatformStore()
      expect(store.adminPlatform).toBe('all')
    })
  })

  describe('平台切换', () => {
    it('应该能切换用户端平台', () => {
      const store = usePlatformStore()
      store.setPlatform('aliexpress')
      expect(store.currentPlatform).toBe('aliexpress')
      expect(localStorageMock.getItem('toolbox_current_platform')).toBe('aliexpress')
    })

    it('应该能切换管理端平台', () => {
      const store = usePlatformStore()
      store.setAdminPlatform('amazon')
      expect(store.adminPlatform).toBe('amazon')
      expect(localStorageMock.getItem('toolbox_admin_platform')).toBe('amazon')
    })
  })

  describe('计算属性', () => {
    it('isAdminAllPlatform 应该正确判断', () => {
      const store = usePlatformStore()
      expect(store.isAdminAllPlatform).toBe(true)
      
      store.setAdminPlatform('amazon')
      expect(store.isAdminAllPlatform).toBe(false)
    })

    it('currentPlatformInfo 应该返回当前平台信息', () => {
      const store = usePlatformStore()
      store.availablePlatforms = [
        { key: 'amazon', name: '亚马逊', status: 'available' },
        { key: 'aliexpress', name: '速卖通', status: 'available' }
      ]
      
      store.setPlatform('amazon')
      expect(store.currentPlatformInfo.key).toBe('amazon')
      expect(store.currentPlatformInfo.name).toBe('亚马逊')
    })

    it('currentPlatformInfo 应该返回默认值当平台不存在时', () => {
      const store = usePlatformStore()
      store.availablePlatforms = []
      
      store.setPlatform('unknown')
      expect(store.currentPlatformInfo.key).toBe('amazon')
    })
  })

  describe('平台可用性检查', () => {
    it('isPlatformAvailable 应该正确判断平台状态', () => {
      const store = usePlatformStore()
      store.availablePlatforms = [
        { key: 'amazon', name: '亚马逊', status: 'available' },
        { key: 'aliexpress', name: '速卖通', status: 'disabled' }
      ]
      
      expect(store.isPlatformAvailable('amazon')).toBe(true)
      expect(store.isPlatformAvailable('aliexpress')).toBe(false)
      expect(store.isPlatformAvailable('unknown')).toBe(false)
    })
  })

  describe('权限检查', () => {
    it('hasPlatformPermission 应该正确处理空权限', () => {
      const store = usePlatformStore()
      expect(store.hasPlatformPermission(null, 'amazon')).toBe(true)
      expect(store.hasPlatformPermission('', 'amazon')).toBe(true)
    })

    it('hasPlatformPermission 应该正确检查权限范围', () => {
      const store = usePlatformStore()
      expect(store.hasPlatformPermission('amazon,aliexpress', 'amazon')).toBe(true)
      expect(store.hasPlatformPermission('amazon,aliexpress', 'aliexpress')).toBe(true)
      expect(store.hasPlatformPermission('amazon', 'aliexpress')).toBe(false)
    })

    it('hasPlatformPermission 应该处理带空格的权限字符串', () => {
      const store = usePlatformStore()
      expect(store.hasPlatformPermission('amazon, aliexpress, tiktok', 'aliexpress')).toBe(true)
    })
  })

  describe('用户可用平台过滤', () => {
    it('getAvailablePlatformsForUser 应该返回所有可用平台当无权限限制时', () => {
      const store = usePlatformStore()
      store.availablePlatforms = [
        { key: 'amazon', name: '亚马逊', status: 'available' },
        { key: 'aliexpress', name: '速卖通', status: 'available' },
        { key: 'tiktok', name: 'TikTok', status: 'disabled' }
      ]
      
      const result = store.getAvailablePlatformsForUser(null)
      expect(result).toHaveLength(2)
      expect(result[0].key).toBe('amazon')
      expect(result[1].key).toBe('aliexpress')
    })

    it('getAvailablePlatformsForUser 应该按权限过滤平台', () => {
      const store = usePlatformStore()
      store.availablePlatforms = [
        { key: 'amazon', name: '亚马逊', status: 'available' },
        { key: 'aliexpress', name: '速卖通', status: 'available' },
        { key: 'tiktok', name: 'TikTok', status: 'available' }
      ]
      
      const result = store.getAvailablePlatformsForUser('amazon,tiktok')
      expect(result).toHaveLength(2)
      expect(result.map(p => p.key)).toEqual(['amazon', 'tiktok'])
    })

    it('getAvailablePlatformsForUser 应该排除 disabled 平台', () => {
      const store = usePlatformStore()
      store.availablePlatforms = [
        { key: 'amazon', name: '亚马逊', status: 'available' },
        { key: 'aliexpress', name: '速卖通', status: 'disabled' }
      ]
      
      const result = store.getAvailablePlatformsForUser('amazon,aliexpress')
      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('amazon')
    })
  })

  describe('加载平台配置', () => {
    it('loadPlatforms 应该成功加载平台列表', async () => {
      const store = usePlatformStore()
      
      // Mock 成功响应
      global.fetch.mockResolvedValueOnce({
        json: async () => [
          { key: 'amazon', name: '亚马逊', status: 'available', sort_order: 1 },
          { key: 'aliexpress', name: '速卖通', status: 'available', sort_order: 2 }
        ]
      })
      
      await store.loadPlatforms()
      
      expect(store.availablePlatforms).toHaveLength(2)
      expect(store.loading).toBe(false)
    })

    it('loadPlatforms 应该处理标准 API 响应格式', async () => {
      const store = usePlatformStore()
      
      // Mock 标准响应格式
      global.fetch.mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: [
            { key: 'amazon', name: '亚马逊', status: 'available' }
          ]
        })
      })
      
      await store.loadPlatforms()
      expect(store.availablePlatforms).toHaveLength(1)
    })

    it('loadPlatforms 应该在失败时使用默认配置', async () => {
      const store = usePlatformStore()
      
      // Mock 失败响应
      global.fetch.mockRejectedValueOnce(new Error('Network error'))
      
      await store.loadPlatforms()
      
      expect(store.availablePlatforms).toHaveLength(2)
      expect(store.availablePlatforms[0].key).toBe('amazon')
      expect(store.loading).toBe(false)
    })

    it('loadPlatforms 应该防止并发加载', async () => {
      const store = usePlatformStore()
      
      // Mock 慢速响应
      global.fetch.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          json: async () => []
        }), 100)
      }))
      
      // 并发调用两次
      const promise1 = store.loadPlatforms()
      const promise2 = store.loadPlatforms()
      
      await Promise.all([promise1, promise2])
      
      // 应该只调用一次 fetch
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('loadPlatforms 应该处理空响应', async () => {
      const store = usePlatformStore()
      
      // Mock 空响应
      global.fetch.mockResolvedValueOnce({
        json: async () => []
      })
      
      await store.loadPlatforms()
      
      // 应该使用默认配置
      expect(store.availablePlatforms).toHaveLength(2)
    })
  })
})