/**
 * 认证系统集成测试
 * 测试 Auth、authService、userStore 三者协同工作
 * 防止格式不一致导致的认证问题
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Auth } from '@/utils'
import { authService } from '@/utils/auth'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'

describe('认证系统集成测试', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  describe('Auth.set() 与 authService.getAuth() 兼容性', () => {
    it('Auth.set() 写入的值能被 authService.getAuth() 正确解析', () => {
      Auth.set('test-auth-code')
      
      const auth = authService.getAuth()
      
      expect(auth).not.toBeNull()
      expect(auth.auth_code).toBe('test-auth-code')
    })

    it('Auth.set() 写入的值能被 JSON.parse 解析（向后兼容）', () => {
      Auth.set('admin')
      
      const raw = localStorage.getItem('toolbox_auth')
      const parsed = JSON.parse(raw)
      
      expect(parsed.auth_code).toBe('admin')
    })
  })

  describe('userStore.setLogin() 与 authService 兼容性', () => {
    it('userStore.setLogin() 写入的值能被 authService.getAuth() 正确解析', () => {
      const userStore = useUserStore()
      userStore.setLogin({
        token: 'test-token',
        role: 'user',
        auth_code: 'USER-AUTH-CODE'
      })
      
      const auth = authService.getAuth()
      
      expect(auth).not.toBeNull()
      expect(auth.auth_code).toBe('USER-AUTH-CODE')
      expect(auth.token).toBe('test-token')
      expect(auth.role).toBe('user')
    })

    it('管理员登录后 authService.getAuth() 返回正确格式', () => {
      const userStore = useUserStore()
      userStore.setLogin({
        token: 'admin-token',
        role: 'admin',
        auth_code: 'admin'
      })
      
      const auth = authService.getAuth()
      
      expect(auth).not.toBeNull()
      expect(auth.auth_code).toBe('admin')
      expect(auth.token).toBe('admin-token')
      expect(auth.role).toBe('admin')
    })
  })

  describe('登录后 isAuthenticated() 返回 true', () => {
    it('Auth.set() 后 isAuthenticated() 返回 true', () => {
      Auth.set('test-code')
      
      expect(authService.isAuthenticated()).toBe(true)
    })

    it('userStore.setLogin() 后 isAuthenticated() 返回 true', () => {
      const userStore = useUserStore()
      userStore.setLogin({
        token: 'test-token',
        role: 'user',
        auth_code: 'test-code'
      })
      
      expect(authService.isAuthenticated()).toBe(true)
    })

    it('管理员登录后 isAuthenticated() 返回 true', () => {
      const userStore = useUserStore()
      userStore.setLogin({
        token: 'admin-token',
        role: 'admin',
        auth_code: 'admin'
      })
      
      expect(authService.isAuthenticated()).toBe(true)
      expect(authService.isAdmin()).toBe(true)
    })
  })

  describe('clear() 清理所有认证信息', () => {
    it('Auth.clear() 清理 toolbox_token', () => {
      localStorage.setItem('toolbox_token', 'test-token')
      localStorage.setItem('toolbox_auth', JSON.stringify({ auth_code: 'test' }))
      
      Auth.clear()
      
      expect(localStorage.getItem('toolbox_token')).toBeNull()
      expect(localStorage.getItem('toolbox_auth')).toBeNull()
    })

    it('authService.clear() 清理 toolbox_token', () => {
      localStorage.setItem('toolbox_token', 'test-token')
      localStorage.setItem('toolbox_auth', JSON.stringify({ auth_code: 'test' }))
      
      authService.clear()
      
      expect(localStorage.getItem('toolbox_token')).toBeNull()
      expect(localStorage.getItem('toolbox_auth')).toBeNull()
      expect(authService.isAuthenticated()).toBe(false)
    })
  })

  describe('向后兼容性：旧版纯字符串格式', () => {
    it('旧版纯字符串格式能被 authService.getAuth() 兼容解析', () => {
      // 模拟旧版数据
      localStorage.setItem('toolbox_auth', 'old-auth-code')
      
      const auth = authService.getAuth()
      
      expect(auth).not.toBeNull()
      expect(auth.auth_code).toBe('old-auth-code')
    })

    it('旧版纯字符串格式下 isAuthenticated() 返回 true', () => {
      localStorage.setItem('toolbox_auth', 'old-auth-code')
      
      expect(authService.isAuthenticated()).toBe(true)
    })
  })
})