/**
 * App Store 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '@/stores/app'

describe('App Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('初始状态', () => {
    it('应该有默认的 loading 状态', () => {
      const store = useAppStore()
      expect(store.loading).toBe(false)
    })

    it('应该有默认的主题', () => {
      const store = useAppStore()
      expect(store.theme).toBeDefined()
    })
  })

  describe('setLoading', () => {
    it('应该设置 loading 状态为 true', () => {
      const store = useAppStore()
      store.setLoading(true)
      expect(store.loading).toBe(true)
    })

    it('应该设置 loading 状态为 false', () => {
      const store = useAppStore()
      store.setLoading(true)
      store.setLoading(false)
      expect(store.loading).toBe(false)
    })
  })

  describe('setTheme', () => {
    it('应该设置主题为 light', () => {
      const store = useAppStore()
      store.setTheme('light')
      expect(store.theme).toBe('light')
    })

    it('应该设置主题为 dark', () => {
      const store = useAppStore()
      store.setTheme('dark')
      expect(store.theme).toBe('dark')
    })
  })

  describe('toggleTheme', () => {
    it('应该切换主题', () => {
      const store = useAppStore()
      const initialTheme = store.theme
      store.toggleTheme()
      expect(store.theme).not.toBe(initialTheme)
    })

    it('应该从 light 切换到 dark', () => {
      const store = useAppStore()
      store.setTheme('light')
      store.toggleTheme()
      expect(store.theme).toBe('dark')
    })

    it('应该从 dark 切换到 light', () => {
      const store = useAppStore()
      store.setTheme('dark')
      store.toggleTheme()
      expect(store.theme).toBe('light')
    })
  })
})