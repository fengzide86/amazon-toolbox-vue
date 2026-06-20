/**
 * 认证服务 - 统一管理用户认证逻辑
 */

const AUTH_KEY = 'toolbox_auth'
const ROLE_KEY = 'toolbox_role'
const USER_KEY = 'toolbox_user'
const PLATFORM_KEY = 'toolbox_current_platform'

class AuthService {
  constructor() {
    this.tokenRefreshTimer = null
  }

  /**
   * 获取认证信息
   */
  getAuth() {
    try {
      const auth = localStorage.getItem(AUTH_KEY)
      return auth ? JSON.parse(auth) : null
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
   */
  isAuthenticated() {
    const auth = this.getAuth()
    if (!auth) return false
    
    // 检查 token 是否过期
    if (auth.expires_at) {
      const expiresAt = new Date(auth.expires_at).getTime()
      if (Date.now() >= expiresAt) {
        this.clear()
        return false
      }
    }
    
    return true
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
   * 刷新 token
   */
  async refreshToken() {
    const auth = this.getAuth()
    if (!auth || !auth.refresh_token) return
    
    try {
      const response = await fetch('/api/auth/refresh', {
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