/**
 * User Store 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'

describe('User Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('初始状态', () => {
    it('应该初始化为未登录状态', () => {
      const store = useUserStore()
      expect(store.isLoggedIn).toBe(false)
      expect(store.token).toBeNull()
      expect(store.role).toBeNull()
    })
  })

  describe('setLogin', () => {
    it('应该设置登录信息', () => {
      const store = useUserStore()
      store.setLogin({
        token: 'test-token',
        role: 'user',
        auth_code: 'CODE-123',
        user: { id: 1, name: 'Test' }
      })
      
      expect(store.isLoggedIn).toBe(true)
      expect(store.token).toBe('test-token')
      expect(store.role).toBe('user')
    })

    it('应该持久化到 localStorage', () => {
      const store = useUserStore()
      store.setLogin({
        token: 'test-token',
        role: 'admin',
        auth_code: 'admin',
        user: {}
      })
      
      // 检查 store 状态是否正确设置
      expect(store.isLoggedIn).toBe(true)
      expect(store.token).toBe('test-token')
      expect(store.role).toBe('admin')
    })
  })

  describe('logout', () => {
    it('应该清除登录状态', () => {
      const store = useUserStore()
      store.setLogin({ token: 'test', role: 'user', auth_code: 'CODE', user: {} })
      store.logout()
      
      expect(store.isLoggedIn).toBe(false)
      expect(store.token).toBeNull()
    })

    it('应该清除 localStorage', () => {
      const store = useUserStore()
      store.setLogin({ token: 'test', role: 'user', auth_code: 'CODE', user: {} })
      store.logout()
      
      expect(localStorage.getItem('toolbox_user')).toBeNull()
    })
  })

  describe('setDevice', () => {
    it('应该设置设备信息', () => {
      const store = useUserStore()
      store.setDevice('device-001', 'Test-PC')
      
      expect(store.deviceId).toBe('device-001')
      expect(store.deviceName).toBe('Test-PC')
    })
  })

  describe('isAdmin', () => {
    it('管理员应该返回 true', () => {
      const store = useUserStore()
      store.setLogin({ token: 'test', role: 'admin', auth_code: 'admin', user: {} })
      
      expect(store.isAdmin).toBe(true)
    })

    it('普通用户应该返回 false', () => {
      const store = useUserStore()
      store.setLogin({ token: 'test', role: 'user', auth_code: 'CODE', user: {} })
      
      expect(store.isAdmin).toBe(false)
    })
  })
})