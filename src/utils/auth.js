/**
 * 认证服务 - 统一管理用户认证逻辑
 */

const AUTH_KEY = 'toolbox_auth'
const ROLE_KEY = 'toolbox_role'
const USER_KEY = 'toolbox_user'
const PLATFORM_KEY = 'toolbox_current_platform'
const TOKEN_KEY = 'toolbox_token'

class AuthService {
  constructor() {
    this.tokenRefreshTimer = null
  }

  /**
   * 获取认证信息
   * 兼容旧版纯字符串格式（如 'admin' 或授权码）
   */
  getAuth() {
    try {
      const auth = localStorage.getItem(AUTH_KEY)
      if (!auth) return null
      // 尝试 JSON 解析
      try {
        return JSON.parse(auth)
      } catch {
        // 兼容旧版纯字符串格式，包装为对象
        return { auth_code: auth }
      }
    } catch (err) {
      console.error('解析认证信息失败:', err)
      return null
    }
  }

  /**
   * 设置认证信息
   */
  setAuth(auth) {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
    } catch (err) {
      console.error('保存认证信息失败:', err)
    }
  }

  /**
   * 获取用户角色
   */
  getRole() {
    return localStorage.getItem(ROLE_KEY) || 'user'
  }

  /**
   * 设置用户角色
   */
  setRole(role) {
    localStorage.setItem(ROLE_KEY, role)
  }

  /**
   * 获取用户信息
   */
  getUser() {
    try {
      const user = localStorage.getItem(USER_KEY)
      return user ? JSON.parse(user) : null
    } catch (err) {
      console.error('解析用户信息失败:', err)
      return null
    }
  }

  /**
   * 设置用户信息
   */
  setUser(user) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    } catch (err) {
      console.error('保存用户信息失败:', err)
    }
  }

  /**
   * 检查是否已登录
   * 检查 toolbox_token 和 toolbox_auth 的过期时间
   */
  isAuthenticated() {
    const auth = this.getAuth()
    if (!auth) return false

    // 检查 auth 过期时间（无论有无 token 都要检查）
    if (auth.expires_at) {
      const expiresAt = new Date(auth.expires_at).getTime()
      if (Date.now() >= expiresAt) {
        this.clear()
        return false
      }
    }

    // 检查 token 是否存在
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) return true

    // 兼容旧版：有 auth 数据但无 token 的情况
    return !!auth.auth_code
  }

  /**
   * 检查是否是管理员
   */
  isAdmin() {
    return this.getRole() === 'admin'
  }

  /**
   * 登录
   */
  login(auth, role, user) {
    this.setAuth(auth)
    this.setRole(role)
    this.setUser(user)
    
    // 启动 token 刷新定时器
    this.startTokenRefresh()
  }

  /**
   * 登出
   */
  logout() {
    this.clear()
    this.stopTokenRefresh()
  }

  /**
   * 清除所有认证信息
   */
  clear() {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(ROLE_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(PLATFORM_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  /**
   * 启动 token 自动刷新
   */
  startTokenRefresh() {
    this.stopTokenRefresh()
    
    // 每 30 分钟检查一次 token
    this.tokenRefreshTimer = setInterval(() => {
      this.refreshToken()
    }, 30 * 60 * 1000)
  }

  /**
   * 停止 token 刷新
   */
  stopTokenRefresh() {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }
  }

  /**
   * 获取 API 基础地址（与 api.js 保持一致，避免循环依赖）
   */
  _getApiBase() {
    try {
      const electronApiBase = localStorage.getItem('toolbox_api_base')
      if (electronApiBase) return electronApiBase
    } catch (e) {}
    const viteApiBase = import.meta.env?.VITE_API_BASE
    if (viteApiBase) return viteApiBase
    return import.meta.env?.DEV ? 'http://localhost:8000' : 'http://8.130.113.104:8000'
  }

  /**
   * 刷新 token
   */
  async refreshToken() {
    const auth = this.getAuth()
    if (!auth || !auth.refresh_token) return
    
    try {
      const apiBase = this._getApiBase()
      const response = await fetch(`${apiBase}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: auth.refresh_token }),
      })
      
      if (response.ok) {
        const data = await response.json()
        this.setAuth(data)
      } else {
        // 刷新失败，登出
        this.logout()
      }
    } catch (err) {
      console.error('刷新 token 失败:', err)
    }
  }

  /**
   * 获取当前平台
   */
  getCurrentPlatform() {
    return localStorage.getItem(PLATFORM_KEY) || 'amazon'
  }

  /**
   * 设置当前平台
   */
  setCurrentPlatform(platform) {
    localStorage.setItem(PLATFORM_KEY, platform)
  }
}

// 导出单例
export const authService = new AuthService()

// 导出便捷方法
export const {
  getAuth,
  setAuth,
  getRole,
  setRole,
  getUser,
  setUser,
  isAuthenticated,
  isAdmin,
  login,
  logout,
  clear,
  getCurrentPlatform,
  setCurrentPlatform,
} = authService