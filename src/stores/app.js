/**
 * 应用状态管理
 * 管理应用级别的全局状态
 * 
 * 使用 Composition API 风格（与 platform.js 保持一致）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  // ===== State =====
  
  // 应用信息
  const appName = ref('跨境电商赛训效率工具箱')
  const version = ref('1.0.5')
  
  // 加载状态
  const loading = ref(false)
  const loadingText = ref('')
  
  // 侧边栏状态
  const sidebarCollapsed = ref(false)
  
  // 主题
  const theme = ref(localStorage.getItem('toolbox_theme') || 'light')
  
  // 系统设置
  const settings = ref(null)
  
  // 套餐列表（缓存）
  const plans = ref([])
  
  // 工具分类（缓存）
  const toolCategories = ref([])

  // ===== Getters =====
  
  // 是否深色模式
  const isDarkMode = computed(() => theme.value === 'dark')
  
  // 获取应用版本
  const getVersion = computed(() => version.value)
  
  // 获取系统设置
  const getSettings = computed(() => settings.value)

  // ===== Actions =====
  
  /**
   * 设置加载状态
   * @param {boolean} isLoading - 是否加载中
   * @param {string} text - 加载提示文字
   */
  function setLoading(isLoading, text = '') {
    loading.value = isLoading
    loadingText.value = text
  }

  /**
   * 切换侧边栏折叠状态
   */
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /**
   * 设置侧边栏折叠状态
   * @param {boolean} collapsed - 是否折叠
   */
  function setSidebarCollapsed(collapsed) {
    sidebarCollapsed.value = collapsed
  }

  /**
   * 切换主题
   */
  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    localStorage.setItem('toolbox_theme', theme.value)
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  /**
   * 设置主题
   * @param {string} newTheme - 主题 light/dark
   */
  function setTheme(newTheme) {
    theme.value = newTheme
    localStorage.setItem('toolbox_theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  /**
   * 设置系统设置
   * @param {Object} newSettings - 系统设置
   */
  function setSettings(newSettings) {
    settings.value = newSettings
  }

  /**
   * 设置套餐列表
   * @param {Array} newPlans - 套餐列表
   */
  function setPlans(newPlans) {
    plans.value = newPlans
  }

  /**
   * 设置工具分类
   * @param {Array} categories - 工具分类列表
   */
  function setToolCategories(categories) {
    toolCategories.value = categories
  }

  /**
   * 重置应用状态
   */
  function reset() {
    settings.value = null
    plans.value = []
    toolCategories.value = []
  }

  return {
    // State
    appName,
    version,
    loading,
    loadingText,
    sidebarCollapsed,
    theme,
    settings,
    plans,
    toolCategories,
    // Getters
    isDarkMode,
    getVersion,
    getSettings,
    // Actions
    setLoading,
    toggleSidebar,
    setSidebarCollapsed,
    toggleTheme,
    setTheme,
    setSettings,
    setPlans,
    setToolCategories,
    reset,
  }
})