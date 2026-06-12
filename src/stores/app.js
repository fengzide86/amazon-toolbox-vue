/**
 * 应用状态管理
 * 管理应用级别的全局状态
 */
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    // 应用信息
    appName: '亚马逊赛训效率工具箱',
    version: '1.0.5',
    
    // 加载状态
    loading: false,
    loadingText: '',
    
    // 侧边栏状态
    sidebarCollapsed: false,
    
    // 主题
    theme: localStorage.getItem('toolbox_theme') || 'light',
    
    // 系统设置
    settings: null,
    
    // 套餐列表（缓存）
    plans: [],
    
    // 工具分类（缓存）
    toolCategories: [],
  }),

  getters: {
    // 是否深色模式
    isDarkMode: (state) => state.theme === 'dark',
    
    // 获取应用版本
    getVersion: (state) => state.version,
    
    // 获取系统设置
    getSettings: (state) => state.settings,
  },

  actions: {
    /**
     * 设置加载状态
     * @param {boolean} isLoading - 是否加载中
     * @param {string} text - 加载提示文字
     */
    setLoading(isLoading, text = '') {
      this.loading = isLoading
      this.loadingText = text
    },

    /**
     * 切换侧边栏折叠状态
     */
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },

    /**
     * 设置侧边栏折叠状态
     * @param {boolean} collapsed - 是否折叠
     */
    setSidebarCollapsed(collapsed) {
      this.sidebarCollapsed = collapsed
    },

    /**
     * 切换主题
     */
    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('toolbox_theme', this.theme)
      document.documentElement.setAttribute('data-theme', this.theme)
    },

    /**
     * 设置主题
     * @param {string} theme - 主题 light/dark
     */
    setTheme(theme) {
      this.theme = theme
      localStorage.setItem('toolbox_theme', theme)
      document.documentElement.setAttribute('data-theme', theme)
    },

    /**
     * 设置系统设置
     * @param {Object} settings - 系统设置
     */
    setSettings(settings) {
      this.settings = settings
    },

    /**
     * 设置套餐列表
     * @param {Array} plans - 套餐列表
     */
    setPlans(plans) {
      this.plans = plans
    },

    /**
     * 设置工具分类
     * @param {Array} categories - 工具分类列表
     */
    setToolCategories(categories) {
      this.toolCategories = categories
    },

    /**
     * 重置应用状态
     */
    reset() {
      this.settings = null
      this.plans = []
      this.toolCategories = []
    },
  },
})