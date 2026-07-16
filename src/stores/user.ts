/**
 * 用户状态管理
 * 管理用户登录状态、token、角色等信息
 * 
 * 使用 Composition API 风格（与 app.js、platform.js 保持一致）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  authenticatedUserSchema,
  parseStoredUser,
  type AuthenticatedUser,
  type AuthRole,
  type LoginPayload,
} from '@/features/auth/model'

export const useUserStore = defineStore('user', () => {
  // ===== State =====
  
  // 认证信息
  const token = ref<string | null>(sessionStorage.getItem('toolbox_token'))
  const storedRole = sessionStorage.getItem('toolbox_role')
  const role = ref<AuthRole | null>(storedRole === 'admin' || storedRole === 'user' ? storedRole : null)
  const auth = ref<string | null>(sessionStorage.getItem('toolbox_auth'))
  const userInfo = ref<AuthenticatedUser | null>(parseStoredUser(localStorage.getItem('toolbox_user')))
  
  // 用户信息
  const userId = ref<string | number | null>(null)
  const userName = ref<string | null>(null)
  const phone = ref<string | null>(null)
  const authCodeId = ref<string | number | null>(null)
  
  // 设备信息
  const deviceId = ref<string | null>(null)
  const deviceName = ref<string | null>(null)

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
  function setLogin(data: LoginPayload) {
    token.value = data.token
    role.value = data.role
    auth.value = data.auth_code || data.auth || null
    const safeUser: AuthenticatedUser | null = data.user ? { ...data.user } : null
    if (safeUser) {
      delete safeUser.token
      delete safeUser.refresh_token
      delete safeUser.auth_code
      delete safeUser.code
    }
    userInfo.value = safeUser
    
    // 访问令牌仅保存在当前 Electron/浏览器会话中
    sessionStorage.setItem('toolbox_token', data.token)
    sessionStorage.setItem('toolbox_role', data.role)
    sessionStorage.setItem('toolbox_auth', JSON.stringify({
      auth_code: data.auth_code || data.auth,
      token: data.token,
      role: data.role
    }))
    localStorage.removeItem('toolbox_token')
    localStorage.removeItem('toolbox_role')
    localStorage.removeItem('toolbox_auth')
    if (safeUser) {
      localStorage.setItem('toolbox_user', JSON.stringify(safeUser))
    }
  }

  /**
   * 设置用户信息
   * @param {Object} newUserInfo - 用户信息
   */
  function setUserInfo(newUserInfo: AuthenticatedUser) {
    const parsed = authenticatedUserSchema.parse(newUserInfo)
    userInfo.value = parsed
    userId.value = parsed.id ?? null
    userName.value = parsed.name ?? null
    phone.value = parsed.phone ?? null
    authCodeId.value = parsed.auth_code_id ?? null
    
    localStorage.setItem('toolbox_user', JSON.stringify(parsed))
  }

  /**
   * 设置设备信息
   * @param {string} id - 设备ID
   * @param {string} name - 设备名称
   */
  function setDevice(id: string, name: string) {
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
    
    // 清除认证状态
    sessionStorage.removeItem('toolbox_token')
    sessionStorage.removeItem('toolbox_role')
    sessionStorage.removeItem('toolbox_auth')
    localStorage.removeItem('toolbox_token')
    localStorage.removeItem('toolbox_role')
    localStorage.removeItem('toolbox_auth')
    localStorage.removeItem('toolbox_user')
    window.electronAPI?.credentialStore?.clearUserCode?.().catch(() => {})
  }

  /**
   * 从 localStorage 恢复状态（页面刷新时）
   */
  function restoreFromStorage() {
    token.value = sessionStorage.getItem('toolbox_token')
    const restoredRole = sessionStorage.getItem('toolbox_role')
    role.value = restoredRole === 'admin' || restoredRole === 'user' ? restoredRole : null
    auth.value = sessionStorage.getItem('toolbox_auth')
    userInfo.value = parseStoredUser(localStorage.getItem('toolbox_user'))
    
    if (userInfo.value) {
      userId.value = userInfo.value.id ?? null
      userName.value = userInfo.value.name ?? null
      phone.value = userInfo.value.phone ?? null
      authCodeId.value = userInfo.value.auth_code_id ?? null
    }
  }

  /**
   * 更新 token
   * @param {string} newToken - 新的 token
   */
  function updateToken(newToken: string) {
    token.value = newToken
    sessionStorage.setItem('toolbox_token', newToken)
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
