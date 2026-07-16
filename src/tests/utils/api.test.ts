/**
 * API 工具函数单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, request, ApiError, verifyAuthCode, adminLogin, getPlans, getAuthCodes, updateAuthCode, deleteAuthCode, getOrders, getUsers, getLogs, getFeedbacks, getDashboard, getSettings, getTools, getProfit } from '@/utils/api'

// Mock fetch
global.fetch = vi.fn()
const mockedFetch = global.fetch as ReturnType<typeof vi.fn>

describe('API Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('api.get', () => {
    it('应该发送 GET 请求', async () => {
      const mockResponse = { success: true, data: ['item1', 'item2'] }
      mockedFetch.mockResolvedValueOnce({
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
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await api.get('/api/test', { page: 1, size: 10 })

      const calledUrl = mockedFetch.mock.calls[0][0]
      expect(calledUrl).toContain('page=1')
      expect(calledUrl).toContain('size=10')
    })

    it('应该自动添加 Token 到请求头', async () => {
      localStorage.setItem('toolbox_token', 'test-token-123')
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await api.get('/api/test')

      const calledConfig = mockedFetch.mock.calls[0][1]
      expect((calledConfig.headers as Record<string, string>).Authorization).toBe('Bearer test-token-123')
    })
  })

  describe('api.post', () => {
    it('应该发送 POST 请求', async () => {
      const mockData = { success: true }
      mockedFetch.mockResolvedValueOnce({
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
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await api.put('/api/test/1', { name: 'updated' })

      const calledConfig = mockedFetch.mock.calls[0][1]
      expect(calledConfig.method).toBe('PUT')
    })
  })

  describe('api.delete', () => {
    it('应该发送 DELETE 请求', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      await api.delete('/api/test/1')

      const calledConfig = mockedFetch.mock.calls[0][1]
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

    it('4xx 请求不应重试并保留状态码', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false, status: 403,
        json: () => Promise.resolve({ detail: '禁止访问' })
      })
      await expect(request('/api/protected', { method: 'GET' })).rejects.toMatchObject({
        name: 'ApiError', status: 403
      })
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('套餐未包含的 403 不应该清空用户登录', async () => {
      sessionStorage.setItem('toolbox_auth', JSON.stringify({ token: 'user-token' }))
      sessionStorage.setItem('toolbox_token', 'user-token')
      sessionStorage.setItem('toolbox_role', 'user')
      mockedFetch.mockResolvedValueOnce({
        ok: false, status: 403,
        json: () => Promise.resolve({ message: '当前套餐暂未包含该工具', error_code: 3006 })
      })

      await expect(request('/api/tools/listing/launch-grant', { method: 'POST' })).rejects.toMatchObject({
        name: 'ApiError', status: 403
      })
      expect(sessionStorage.getItem('toolbox_token')).toBe('user-token')
      expect(window.location.hash).not.toContain('/login')
    })

    it('POST 服务端错误不应自动重试', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false, status: 500,
        json: () => Promise.resolve({ detail: '服务异常' })
      })
      await expect(request('/api/orders', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('业务 API 函数', () => {
    beforeEach(() => {
      mockedFetch.mockResolvedValue({
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

    it('授权码更新和删除应把真实 ID 放进请求路径', async () => {
      await updateAuthCode(42, { note: 'updated' })
      expect(mockedFetch.mock.calls[0][0]).toContain('/api/auth-codes/42')

      vi.clearAllMocks()
      mockedFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) })
      await deleteAuthCode('CODE-9')
      expect(mockedFetch.mock.calls[0][0]).toContain('/api/auth-codes/CODE-9')
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

      const calledUrl = mockedFetch.mock.calls[0][0]
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
