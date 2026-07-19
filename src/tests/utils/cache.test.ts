import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setCache, getCache, removeCache, clearAllCache, generateCacheKey } from '../../utils/cache'

describe('缓存工具', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('setCache / getCache', () => {
    it('应该存储和读取缓存', () => {
      setCache('test-key', { data: 'test' })
      const result = getCache('test-key')
      expect(result).toEqual({ data: 'test' })
    })

    it('应该在过期后返回 null', () => {
      vi.useFakeTimers()
      setCache('test-key', { data: 'test' }, 1000) // 1秒过期
      vi.advanceTimersByTime(1001)
      const result = getCache('test-key')
      expect(result).toBeNull()
      vi.useRealTimers()
    })

    it('应该在未过期时返回数据', () => {
      vi.useFakeTimers()
      setCache('test-key', { data: 'test' }, 5000) // 5秒过期
      vi.advanceTimersByTime(3000)
      const result = getCache('test-key')
      expect(result).toEqual({ data: 'test' })
      vi.useRealTimers()
    })

    it('应该处理不存在的键', () => {
      const result = getCache('non-existent')
      expect(result).toBeNull()
    })
  })

  describe('removeCache', () => {
    it('应该删除缓存', () => {
      setCache('test-key', { data: 'test' })
      removeCache('test-key')
      const result = getCache('test-key')
      expect(result).toBeNull()
    })
  })

  describe('clearAllCache', () => {
    it('应该清空所有缓存', () => {
      setCache('key1', 'value1')
      setCache('key2', 'value2')
      clearAllCache()
      expect(getCache('key1')).toBeNull()
      expect(getCache('key2')).toBeNull()
    })
  })

  describe('generateCacheKey', () => {
    it('应该生成缓存键', () => {
      sessionStorage.setItem('toolbox_role', 'support')
      localStorage.setItem('toolbox_user', JSON.stringify({ staff_id: 7, auth_code_id: 12 }))
      const key = generateCacheKey('/api/test', { id: 1, name: 'test' })
      expect(key).toBe('support:7:12:/api/test?id=1&name=test')
    })

    it('应该按参数名排序', () => {
      const key1 = generateCacheKey('/api/test', { b: 2, a: 1 })
      const key2 = generateCacheKey('/api/test', { a: 1, b: 2 })
      expect(key1).toBe(key2)
    })

    it('应该处理无参数的情况', () => {
      const key = generateCacheKey('/api/test')
      expect(key).toBe('user:unknown:none:/api/test')
    })

    it('应该隔离不同用户和角色的缓存键', () => {
      sessionStorage.setItem('toolbox_role', 'operator')
      localStorage.setItem('toolbox_user', JSON.stringify({ staff_id: 8 }))
      const operatorKey = generateCacheKey('/api/test')

      sessionStorage.setItem('toolbox_role', 'support')
      localStorage.setItem('toolbox_user', JSON.stringify({ staff_id: 9 }))
      const supportKey = generateCacheKey('/api/test')

      expect(operatorKey).not.toBe(supportKey)
      expect(operatorKey).toBe('operator:8:none:/api/test')
      expect(supportKey).toBe('support:9:none:/api/test')
    })
  })
})
