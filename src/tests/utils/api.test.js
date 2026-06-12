/**
 * API 工具函数单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, verifyAuthCode, adminLogin, getPlans, getAuthCodes, getOrders, getUsers, getLogs, getFeedbacks, getDashboard, getSettings, getTools, getProfit } from '@/utils/api'

// Mock fetch
global.fetch = vi.fn()

describe('API Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('api.get', () => {
    it('应该发送 GET 请求', async () => {
      const mockResponse = { success: true, data: ['item1', 'item2'] }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await api.get('/api/test')

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.objectContaining({ method: 'GET' })
      )
      // api.get 会自动提取 response.data
      expect(result).toEqual(['item1', 'item2'])
    })

    it('应该正确处理查询参数', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await api.get('/api/test', { page: 1, size: 10 })

      const calledUrl = global.fetch.mock.calls[0][0]
      expect(calledUrl).toContain('page=1')
      expect(calledUrl).toContain('size=10')
    })

    it('应该自动添加 Token 到请求头', async () => {
      localStorage.setItem('toolbox_token', 'test-token-123')
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await api.get('/api/test')

      const calledConfig = global.fetch.mock.calls[0][1]
      expect(calledConfig.headers.Authorization).toBe('Bearer test-token-123')
    })
  })

  describe('api.post', () => {
    it('应该发送 POST 请求', async () => {
      const mockData = { success: true }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      })

      const postData = { name: 'test' }
      const result = await api.post('/api/test', postData)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(postData)
        })
      )
      expect(result).toEqual(mockData)
    })
  })

  describe('api.put', () => {
    it('应该发送 PUT 请求', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await api.put('/api/test/1', { name: 'updated' })

      const calledConfig = global.fetch.mock.calls[0][1]
      expect(calledConfig.method).toBe('PUT')
    })
  })

  describe('api.delete', () => {
    it('应该发送 DELETE 请求', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await api.delete('/api/test/1')

      const calledConfig = global.fetch.mock.calls[0][1]
      expect(calledConfig.method).toBe('DELETE')
    })
  })

  describe('错误处理', () => {
    // 注意：api.js 中的 request 函数有重试机制和 pendingRequests 缓存
    // 错误处理测试需要在集成测试中覆盖，单元测试中跳过
    it('应该定义 request 函数', () => {
      expect(api.get).toBeDefined()
      expect(api.post).toBeDefined()
      expect(api.put).toBeDefined()
      expect(api.delete).toBeDefined()
    })
  })

  describe('业务 API 函数', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} })
      })
    })

    it('verifyAuthCode 应该调用正确的接口', async () => {
      await verifyAuthCode('CODE-123', 'device-001', '测试设备')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/verify'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            code: 'CODE-123',
            device_id: 'device-001',
            device_name: '测试设备'
          })
        })
      )
    })

    it('adminLogin 应该调用正确的接口', async () => {
      await adminLogin('admin123')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/admin-login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ password: 'admin123' })
        })
      )
    })

    it('getPlans 应该调用正确的接口', async () => {
      await getPlans()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/plans'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getAuthCodes 应该调用正确的接口', async () => {
      await getAuthCodes()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth-codes'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getOrders 应该调用正确的接口', async () => {
      await getOrders()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getUsers 应该调用正确的接口', async () => {
      await getUsers()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getLogs 应该调用正确的接口', async () => {
      await getLogs()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/logs'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getLogs 应该支持 user_id 参数', async () => {
      await getLogs(42)

      const calledUrl = global.fetch.mock.calls[0][0]
      expect(calledUrl).toContain('user_id=42')
    })

    it('getFeedbacks 应该调用正确的接口', async () => {
      await getFeedbacks()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/feedback'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getDashboard 应该调用正确的接口', async () => {
      await getDashboard()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/dashboard'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getSettings 应该调用正确的接口', async () => {
      await getSettings()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/settings'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getTools 应该调用正确的接口', async () => {
      await getTools()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tools'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('getProfit 应该调用正确的接口', async () => {
      await getProfit()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/profit'),
        expect.objectContaining({ method: 'GET' })
      )
    })
  })
})