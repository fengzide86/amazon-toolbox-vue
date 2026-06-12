/**
 * 用户状态管理
 * 管理用户登录状态、token、角色等信息
 */
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    // 认证信息
    token: localStorage.getItem('toolbox_token') || null,
    role: localStorage.getItem('toolbox_role') || null,
    auth: localStorage.getItem('toolbox_auth') || null,
    userInfo: JSON.parse(localStorage.getItem('toolbox_user') || 'null'),
    
    // 用户信息
    userId: null,
    userName: null,
    phone: null,
    authCodeId: null,
    
    // 设备信息
    deviceId: null,
    deviceName: null,
  }),

  getters: {
    // 是否已登录
    isLoggedIn: (state) => !!state.token && !!state.auth,
    
    // 是否是管理员
    isAdmin: (state) => state.role === 'admin',
    
    // 是否是普通用户
    isUser: (state) => state.role === 'user',
    
    // 获取授权信息
    getAuth: (state) => state.auth,
    
    // 获取用户ID
    getUserId: (state) => state.userId || state.userInfo?.id,
    
    // 获取设备ID
    getDeviceId: (state) => state.deviceId,
  },

  actions: {
    /**
     * 设置登录信息
     * @param {Object} data - 登录返回的数据
     */
    setLogin(data) {
      this.token = data.token
      this.role = data.role
      this.auth = data.auth_code || data.auth
      this.userInfo = data.user || null
      
      // 同步到 localStorage
      localStorage.setItem('toolbox_token', data.token)
      localStorage.setItem('toolbox_role', data.role)
      localStorage.setItem('toolbox_auth', data.auth_code || data.auth)
      if (data.user) {
        localStorage.setItem('toolbox_user', JSON.stringify(data.user))
      }
    },

    /**
     * 设置用户信息
     * @param {Object} userInfo - 用户信息
     */
    setUserInfo(userInfo) {
      this.userInfo = userInfo
      this.userId = userInfo.id
      this.userName = userInfo.name
      this.phone = userInfo.phone
      this.authCodeId = userInfo.auth_code_id
      
      localStorage.setItem('toolbox_user', JSON.stringify(userInfo))
    },

    /**
     * 设置设备信息
     * @param {string} deviceId - 设备ID
     * @param {string} deviceName - 设备名称
     */
    setDevice(deviceId, deviceName) {
      this.deviceId = deviceId
      this.deviceName = deviceName
    },

    /**
     * 登出
     */
    logout() {
      this.token = null
      this.role = null
      this.auth = null
      this.userInfo = null
      this.userId = null
      this.userName = null
      this.phone = null
      this.authCodeId = null
      
      // 清除 localStorage
      localStorage.removeItem('toolbox_token')
      localStorage.removeItem('toolbox_role')
      localStorage.removeItem('toolbox_auth')
      localStorage.removeItem('toolbox_user')
    },

    /**
     * 从 localStorage 恢复状态（页面刷新时）
     */
    restoreFromStorage() {
      this.token = localStorage.getItem('toolbox_token')
      this.role = localStorage.getItem('toolbox_role')
      this.auth = localStorage.getItem('toolbox_auth')
      this.userInfo = JSON.parse(localStorage.getItem('toolbox_user') || 'null')
      
      if (this.userInfo) {
        this.userId = this.userInfo.id
        this.userName = this.userInfo.name
        this.phone = this.userInfo.phone
        this.authCodeId = this.userInfo.auth_code_id
      }
    },

    /**
     * 更新 token
     * @param {string} newToken - 新的 token
     */
    updateToken(newToken) {
      this.token = newToken
      localStorage.setItem('toolbox_token', newToken)
    },
  },
})