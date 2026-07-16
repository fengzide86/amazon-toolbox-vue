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
})
