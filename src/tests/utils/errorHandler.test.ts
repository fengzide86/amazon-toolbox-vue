/**
 * 错误处理工具单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleApiError, withErrorHandling, getUserFriendlyMessage, BusinessError } from '@/utils/errorHandler'

// Mock Element Plus
vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))

describe('Error Handler Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserFriendlyMessage', () => {
    it('应该返回网络错误的友好消息', () => {
      const error = new Error('Network Error')
      const message = getUserFriendlyMessage(error)
      expect(message).toBe('网络连接失败，请检查网络')
    })

    it('应该返回请求失败的友好消息', () => {
      const error = new Error('Request failed')
      const message = getUserFriendlyMessage(error)
      expect(message).toBe('请求失败，请稍后重试')
    })

    it('应该返回超时的友好消息', () => {
      const error = new Error('timeout of 10000ms exceeded')
      const message = getUserFriendlyMessage(error)
      expect(message).toBe('请求超时，请稍后重试')
    })

    it('应该返回 401 错误的友好消息', () => {
      const error = new Error('Request failed with status code 401')
      const message = getUserFriendlyMessage(error)
      expect(message).toBe('登录已过期，请重新登录')
    })

    it('应该返回 403 错误的友好消息', () => {
      const error = new Error('Request failed with status code 403')
      const message = getUserFriendlyMessage(error)
      expect(message).toBe('没有权限执行此操作')
    })

    it('应该返回 500 错误的友好消息', () => {
      const error = new Error('Request failed with status code 500')
      const message = getUserFriendlyMessage(error)
      expect(message).toBe('服务器内部错误，请稍后重试')
    })

    it('应该处理字符串类型的错误', () => {
      const message = getUserFriendlyMessage('Network Error')
      expect(message).toBe('网络连接失败，请检查网络')
    })

    it('应该处理空错误', () => {
      const message = getUserFriendlyMessage(null)
      expect(message).toBe('操作失败，请稍后重试')
    })

    it('应该返回原始消息当没有匹配时', () => {
      const error = new Error('Unknown error')
      const message = getUserFriendlyMessage(error)
      expect(message).toBe('Unknown error')
    })
  })

  describe('handleApiError', () => {
    it('应该返回友好的错误消息', () => {
      const error = new Error('Network Error')
      const message = handleApiError(error)
      expect(message).toBe('网络连接失败，请检查网络')
    })

    it('应该处理带上下文的错误', () => {
      const error = new Error('Request failed')
      const message = handleApiError(error, 'test context')
      expect(message).toBe('请求失败，请稍后重试')
    })
  })

  describe('withErrorHandling', () => {
    it('应该成功执行函数并返回结果', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await withErrorHandling(fn, 'test')
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalled()
    })

    it('应该在函数失败时调用 handleApiError', async () => {
      const error = new Error('Network Error')
      const fn = vi.fn().mockRejectedValue(error)
      
      await expect(withErrorHandling(fn, 'test')).rejects.toThrow()
    })

    it('应该在函数失败后重新抛出错误', async () => {
      const error = new Error('Test error')
      const fn = vi.fn().mockRejectedValue(error)
      
      await expect(withErrorHandling(fn, 'test')).rejects.toThrow('Test error')
    })
  })

  describe('BusinessError', () => {
    it('应该创建业务错误实例', () => {
      const error = new BusinessError('业务错误', 'BIZ_001')
      expect(error.message).toBe('业务错误')
      expect(error.code).toBe('BIZ_001')
      expect(error.name).toBe('BusinessError')
    })

    it('应该使用默认错误码', () => {
      const error = new BusinessError('业务错误')
      expect(error.code).toBe('BUSINESS_ERROR')
    })

    it('应该是 Error 的实例', () => {
      const error = new BusinessError('业务错误')
      expect(error instanceof Error).toBe(true)
    })
  })
})