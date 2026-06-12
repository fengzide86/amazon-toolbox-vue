/**
 * 认证流程集成测试
 * 测试完整的用户登录和管理员登录流程
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import LoginView from '@/views/user/LoginView.vue'
import AdminLoginView from '@/views/admin/AdminLoginView.vue'
import { mountWithPinia } from '@/tests/helpers'

// Mock vue-router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ path: '/user/login' })
}))

// Mock utils
const mockShowToast = vi.fn()
vi.mock('@/utils', () => ({
  Auth: { set: vi.fn(), clear: vi.fn() },
  showToast: (...args) => mockShowToast(...args),
  getDeviceId: () => 'test-device-id-001',
  getDeviceName: () => 'Test-PC'
}))

// Mock api
const mockVerifyAuthCode = vi.fn()
const mockAdminLogin = vi.fn()
const mockGetSettings = vi.fn().mockResolvedValue([])
vi.mock('@/utils/api', () => ({
  verifyAuthCode: (...args) => mockVerifyAuthCode(...args),
  adminLogin: (...args) => mockAdminLogin(...args),
  getSettings: () => mockGetSettings()
}))

describe('认证流程集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGetSettings.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('用户授权码登录流程', () => {
    it('完整流程：输入授权码 → 验证 → 保存信息 → 跳转首页', async () => {
      // Step 1: 渲染登录页面
      const wrapper = mountWithPinia(LoginView)
      expect(wrapper.find('#authCode').exists()).toBe(true)

      // Step 2: 输入授权码
      const input = wrapper.find('#authCode')
      await input.setValue('SVIP-2024-TEST')

      // Step 3: 提交表单
      mockVerifyAuthCode.mockResolvedValue({
        success: true,
        data: {
          token: 'user-jwt-token',
          name: 'TestUser',
          plan: 'SVIP',
          expires_at: '2025-12-31'
        }
      })

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      // Step 4: 验证 API 调用
      expect(mockVerifyAuthCode).toHaveBeenCalledWith(
        'SVIP-2024-TEST',
        'test-device-id-001',
        'Test-PC'
      )

      // Step 5: 验证成功消息
      expect(wrapper.find('.success-message').classes()).toContain('show')
      expect(mockShowToast).toHaveBeenCalledWith('授权成功！正在跳转...', 'success')

      // Step 6: 验证 localStorage 存储
      expect(localStorage.setItem).toHaveBeenCalledWith('toolbox_role', 'user')
      expect(localStorage.setItem).toHaveBeenCalledWith('toolbox_token', 'user-jwt-token')

      // Step 7: 验证跳转
      vi.advanceTimersByTime(1200)
      expect(mockPush).toHaveBeenCalledWith('/user/dashboard')
    })

    it('错误流程：输入无效授权码 → 显示错误 → 可重新输入', async () => {
      const wrapper = mountWithPinia(LoginView)

      // 第一次尝试
      await wrapper.find('#authCode').setValue('INVALID-CODE')
      mockVerifyAuthCode.mockResolvedValue({
        success: false,
        message: '授权码已过期'
      })

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('.error-message').classes()).toContain('show')
      expect(wrapper.find('.error-message span').text()).toBe('授权码已过期')

      // 第二次尝试
      mockVerifyAuthCode.mockResolvedValue({
        success: true,
        data: { token: 'new-token' }
      })

      await wrapper.find('#authCode').setValue('VALID-CODE-1234')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('.success-message').classes()).toContain('show')
    })
  })

  describe('管理员密码登录流程', () => {
    it('完整流程：输入密码 → 验证 → 保存Token → 跳转管理后台', async () => {
      const wrapper = mountWithPinia(AdminLoginView)

      // 输入密码
      await wrapper.find('#adminPassword').setValue('admin123')

      // 模拟成功响应
      mockAdminLogin.mockResolvedValue({
        success: true,
        data: { token: 'admin-jwt-token' }
      })

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      // 验证
      expect(mockAdminLogin).toHaveBeenCalledWith('admin123')
      expect(localStorage.setItem).toHaveBeenCalledWith('toolbox_role', 'admin')
      expect(localStorage.setItem).toHaveBeenCalledWith('toolbox_token', 'admin-jwt-token')
      expect(wrapper.find('.success-message').classes()).toContain('show')

      vi.advanceTimersByTime(1000)
      expect(mockPush).toHaveBeenCalledWith('/admin/dashboard')
    })

    it('错误流程：密码错误 → 显示错误 → 可重试', async () => {
      const wrapper = mountWithPinia(AdminLoginView)

      await wrapper.find('#adminPassword').setValue('wrong-password')
      mockAdminLogin.mockResolvedValue({
        success: false,
        message: '密码错误'
      })

      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('.error-message').classes()).toContain('show')
      expect(wrapper.find('.error-message span').text()).toBe('密码错误')

      // 重试
      mockAdminLogin.mockResolvedValue({
        success: true,
        data: { token: 'admin-token' }
      })

      await wrapper.find('#adminPassword').setValue('admin123')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('.success-message').classes()).toContain('show')
    })
  })

  describe('表单验证边界测试', () => {
    it('用户登录：空授权码不能提交', async () => {
      const wrapper = mountWithPinia(LoginView)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(mockVerifyAuthCode).not.toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('请输入授权码', 'error')
    })

    it('用户登录：授权码格式验证', async () => {
      const wrapper = mountWithPinia(LoginView)

      // 太短
      await wrapper.find('#authCode').setValue('AB')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(mockVerifyAuthCode).not.toHaveBeenCalled()

      // 非法字符
      await wrapper.find('#authCode').setValue('TEST@CODE!')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(mockVerifyAuthCode).not.toHaveBeenCalled()

      // 合法格式
      mockVerifyAuthCode.mockResolvedValue({ success: true, data: { token: 'test' } })
      await wrapper.find('#authCode').setValue('VALID-CODE-1234')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(mockVerifyAuthCode).toHaveBeenCalled()
    })

    it('管理员登录：空密码不能提交', async () => {
      const wrapper = mountWithPinia(AdminLoginView)
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(mockAdminLogin).not.toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('请输入密码', 'error')
    })
  })

  describe('网络异常处理', () => {
    it('用户登录：网络断开应该显示友好错误', async () => {
      const wrapper = mountWithPinia(LoginView)
      await wrapper.find('#authCode').setValue('TEST-CODE-1234')

      mockVerifyAuthCode.mockRejectedValue(new Error('Failed to fetch'))
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('.error-message').classes()).toContain('show')
      expect(wrapper.find('.error-message span').text()).toContain('网络连接失败')
    })

    it('管理员登录：网络断开应该显示友好错误', async () => {
      const wrapper = mountWithPinia(AdminLoginView)
      await wrapper.find('#adminPassword').setValue('admin123')

      mockAdminLogin.mockRejectedValue(new Error('Failed to fetch'))
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      expect(wrapper.find('.error-message').classes()).toContain('show')
      expect(wrapper.find('.error-message span').text()).toContain('无法连接到后端服务')
    })
  })
})