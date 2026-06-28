import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 动态获取 API 地址（不依赖静态导入，确保 Electron 注入的 localStorage 生效）
function getApiBase() {
  try {
    const electronApiBase = localStorage.getItem('toolbox_api_base')
    if (electronApiBase) return electronApiBase
  } catch (e) {}
  const viteApiBase = import.meta.env?.VITE_API_BASE
  if (viteApiBase) return viteApiBase
  return 'http://localhost:8000' // 打包应用使用内嵌本地后端
}

export const usePlatformStore = defineStore('platform', () => {
  // 状态
  const currentPlatform = ref(localStorage.getItem('toolbox_current_platform') || 'amazon')
  const adminPlatform = ref(localStorage.getItem('toolbox_admin_platform') || 'all')
  const availablePlatforms = ref([])
  const loading = ref(false)

  // 计算属性
  const isAdminAllPlatform = computed(() => adminPlatform.value === 'all')
  const currentPlatformInfo = computed(() => {
    return availablePlatforms.value.find(p => p.key === currentPlatform.value) || 
           { key: 'amazon', name: '亚马逊', short_name: '亚马逊', status: 'available' }
  })

  // 设置用户端当前平台
  const setPlatform = (platformKey) => {
    currentPlatform.value = platformKey
    localStorage.setItem('toolbox_current_platform', platformKey)
  }

  // 设置管理端平台筛选
  const setAdminPlatform = (platformKey) => {
    adminPlatform.value = platformKey
    localStorage.setItem('toolbox_admin_platform', platformKey)
  }

  // 加载平台配置
  const loadPlatforms = async () => {
    if (loading.value) return
    loading.value = true
    try {
      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/api/tools/platforms`)
      const data = await response.json()
      // API 可能返回数组或 {success, data} 格式
      if (Array.isArray(data)) {
        availablePlatforms.value = data
      } else if (data.success && data.data) {
        availablePlatforms.value = data.data
      } else if (data.data && Array.isArray(data.data)) {
        availablePlatforms.value = data.data
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
  const isPlatformAvailable = (platformKey) => {
    const platform = availablePlatforms.value.find(p => p.key === platformKey)
    return Boolean(platform && platform.status === 'available')
  }

  // 检查用户是否有平台权限
  const hasPlatformPermission = (platformScope, platformKey) => {
    if (!platformScope) return true // 未设置则默认有权限
    const scopes = platformScope.split(',').map(s => s.trim())
    return scopes.includes(platformKey)
  }

  // 获取可用平台列表（根据授权权限过滤）
  const getAvailablePlatformsForUser = (platformScope) => {
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