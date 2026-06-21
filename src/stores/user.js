/**
 * 用户状态管理
 * 管理用户登录状态、token、角色等信息
 * 
 * 使用 Composition API 风格（与 app.js、platform.js 保持一致）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  // ===== State =====
  
  // 认证信息
  const token = ref(localStorage.getItem('toolbox_token') || null)
  const role = ref(localStorage.getItem('toolbox_role') || null)
  const auth = ref(localStorage.getItem('toolbox_auth') || null)
  const userInfo = ref(JSON.parse(localStorage.getItem('toolbox_user') || 'null'))
  
  // 用户信息
  const userId = ref(null)
  const userName = ref(null)
  const phone = ref(null)
  const authCodeId = ref(null)
  
  // 设备信息
  const deviceId = ref(null)
  const deviceName = ref(null)

  // ===== Getters =====
  
  // 是否已登录
  const isLoggedIn = computed(() => !!token.value && !!auth.value)
  
  // 是否是管理员
  const isAdmin = computed(() => role.value === 'admin')
  
  // 是否是普通用户
  const isUser = computed(() => role.value === 'user')
  
  // 获取授权信息
  const getAuth = computed(() => auth.value)
  
  // 获取用户ID
  const getUserId = computed(() => userId.value || userInfo.value?.id)
  
  // 获取设备ID
  const getDeviceId = computed(() => deviceId.value)

  // ===== Actions =====
  
  /**
   * 设置登录信息
   * @param {Object} data - 登录返回的数据
   */
  function setLogin(data) {
    token.value = data.token
    role.value = data.role
    auth.value = data.auth_code || data.auth
    userInfo.value = data.user || null
    
    // 同步到 localStorage
    localStorage.setItem('toolbox_token', data.token)
    localStorage.setItem('toolbox_role', data.role)
    // 写入 JSON 格式，兼容 authService.getAuth() 的 JSON.parse 解析
    localStorage.setItem('toolbox_auth', JSON.stringify({
      auth_code: data.auth_code || data.auth,
      token: data.token,
      role: data.role
    }))
    if (data.user) {
      localStorage.setItem('toolbox_user', JSON.stringify(data.user))
    }
  }

  /**
   * 设置用户信息
   * @param {Object} newUserInfo - 用户信息
   */
  function setUserInfo(newUserInfo) {
    userInfo.value = newUserInfo
    userId.value = newUserInfo.id
    userName.value = newUserInfo.name
    phone.value = newUserInfo.phone
    authCodeId.value = newUserInfo.auth_code_id
    
    localStorage.setItem('toolbox_user', JSON.stringify(newUserInfo))
  }

  /**
   * 设置设备信息
   * @param {string} id - 设备ID
   * @param {string} name - 设备名称
   */
  function setDevice(id, name) {
    deviceId.value = id
    deviceName.value = name
  }

  /**
   * 登出
   */
  function logout() {
    token.value = null
    role.value = null
    auth.value = null
    userInfo.value = null
    userId.value = null
    userName.value = null
    phone.value = null
    authCodeId.value = null
    
    // 清除 localStorage
    localStorage.removeItem('toolbox_token')
    localStorage.removeItem('toolbox_role')
    localStorage.removeItem('toolbox_auth')
    localStorage.removeItem('toolbox_user')
  }

  /**
   * 从 localStorage 恢复状态（页面刷新时）
   */
  function restoreFromStorage() {
    token.value = localStorage.getItem('toolbox_token')
    role.value = localStorage.getItem('toolbox_role')
    auth.value = localStorage.getItem('toolbox_auth')
    userInfo.value = JSON.parse(localStorage.getItem('toolbox_user') || 'null')
    
    if (userInfo.value) {
      userId.value = userInfo.value.id
      userName.value = userInfo.value.name
      phone.value = userInfo.value.phone
      authCodeId.value = userInfo.value.auth_code_id
    }
  }

  /**
   * 更新 token
   * @param {string} newToken - 新的 token
   */
  function updateToken(newToken) {
    token.value = newToken
    localStorage.setItem('toolbox_token', newToken)
  }

  return {
    // State
    token,
    role,
    auth,
    userInfo,
    userId,
    userName,
    phone,
    authCodeId,
    deviceId,
    deviceName,
    // Getters
    isLoggedIn,
    isAdmin,
    isUser,
    getAuth,
    getUserId,
    getDeviceId,
    // Actions
    setLogin,
    setUserInfo,
    setDevice,
    logout,
    restoreFromStorage,
    updateToken,
  }
})