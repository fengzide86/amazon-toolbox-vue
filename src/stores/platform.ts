import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toolboxVersionHeaders } from '@/shared/api/client-metadata'
import { getApiBase } from '@/shared/api/base'

export interface PlatformInfo {
  key: string
  name: string
  short_name?: string
  status: string
  sort_order?: number
}

interface PlatformResponse {
  success?: boolean
  data?: PlatformInfo[]
}

export const usePlatformStore = defineStore('platform', () => {
  // 状态
  const currentPlatform = ref(localStorage.getItem('toolbox_current_platform') || 'amazon')
  const adminPlatform = ref(localStorage.getItem('toolbox_admin_platform') || 'all')
  const availablePlatforms = ref<PlatformInfo[]>([])
  const loading = ref(false)

  // 计算属性
  const isAdminAllPlatform = computed(() => adminPlatform.value === 'all')
  const currentPlatformInfo = computed(() => {
    return availablePlatforms.value.find(p => p.key === currentPlatform.value) || 
           { key: 'amazon', name: '亚马逊', short_name: '亚马逊', status: 'available' }
  })

  // 设置用户端当前平台
  const setPlatform = (platformKey: string) => {
    currentPlatform.value = platformKey
    localStorage.setItem('toolbox_current_platform', platformKey)
  }

  // 设置管理端平台筛选
  const setAdminPlatform = (platformKey: string) => {
    adminPlatform.value = platformKey
    localStorage.setItem('toolbox_admin_platform', platformKey)
  }

  // 加载平台配置
  const loadPlatforms = async () => {
    if (loading.value) return
    loading.value = true
    try {
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/tools/platforms`, { headers: toolboxVersionHeaders() })
      const data: unknown = await response.json()
      // API 可能返回数组或 {success, data} 格式
      if (Array.isArray(data)) {
        availablePlatforms.value = data
      } else if (typeof data === 'object' && data !== null) {
        const wrapped = data as PlatformResponse
        if (Array.isArray(wrapped.data)) availablePlatforms.value = wrapped.data
      }
      // 如果返回为空，使用默认配置
      if (!availablePlatforms.value.length) {
        availablePlatforms.value = [
          { key: 'amazon', name: '亚马逊', short_name: '亚马逊', status: 'available', sort_order: 1 },
          { key: 'aliexpress', name: '速卖通', short_name: '速卖通', status: 'available', sort_order: 2 }
        ]
      }
    } catch (error) {
      console.error('加载平台配置失败:', error)
      // 使用默认配置
      availablePlatforms.value = [
        { key: 'amazon', name: '亚马逊', short_name: '亚马逊', status: 'available', sort_order: 1 },
        { key: 'aliexpress', name: '速卖通', short_name: '速卖通', status: 'available', sort_order: 2 }
      ]
    } finally {
      loading.value = false
    }
  }

  // 检查平台是否可用
  const isPlatformAvailable = (platformKey: string) => {
    const platform = availablePlatforms.value.find(p => p.key === platformKey)
    return Boolean(platform && platform.status === 'available')
  }

  // 检查用户是否有平台权限
  const hasPlatformPermission = (platformScope: string | null | undefined, platformKey: string) => {
    if (!platformScope) return true // 未设置则默认有权限
    const scopes = platformScope.split(',').map(s => s.trim())
    return scopes.includes(platformKey)
  }

  // 获取可用平台列表（根据授权权限过滤）
  const getAvailablePlatformsForUser = (platformScope: string | null | undefined) => {
    if (!platformScope) return availablePlatforms.value.filter(p => p.status === 'available')
    const scopes = platformScope.split(',').map(s => s.trim())
    return availablePlatforms.value.filter(p => p.status === 'available' && scopes.includes(p.key))
  }

  return {
    // 状态
    currentPlatform,
    adminPlatform,
    availablePlatforms,
    loading,
    // 计算属性
    isAdminAllPlatform,
    currentPlatformInfo,
    // 方法
    setPlatform,
    setAdminPlatform,
    loadPlatforms,
    isPlatformAvailable,
    hasPlatformPermission,
    getAvailablePlatformsForUser
  }
})
