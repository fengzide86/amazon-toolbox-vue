/**
 * LoginView 用户登录页面测试
 * 测试授权码登录、设备绑定、弹窗交互等功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import LoginView from '@/views/user/LoginView.vue'
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
const mockGetSettings = vi.fn().mockResolvedValue([])
vi.mock('@/utils/api', () => ({
  verifyAuthCode: (...args) => mockVerifyAuthCode(...args),
  getSettings: () => mockGetSettings()
}))

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGetSettings.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('渲染测试', () => {
    it('应该正确渲染登录页面', () => {
      const wrapper = mountWithPinia(LoginView)
      expect(wrapper.find('.login-page').exists()).toBe(true)
      expect(wrapper.find('.login-form-card').exists()).toBe(true)
    })

    it('应该显示应用标题', () => {
      const wrapper = mountWithPinia(LoginView)
      expect(wrapper.find('h1').text()).toBe('亚马逊赛训效率工具箱')
    })

    it('应该显示授权码提示', () => {
      const wrapper = mountWithPinia(LoginView)
      expect(wrapper.text()).toContain('请输入授权码激活您的工具箱')
    })

    it('应该渲染授权码输入框', () => {
      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      expect(input.exists()).toBe(true)
      expect(input.attributes('type')).toBe('text')
    })

    it('应该显示设备信息区域', () => {
      const wrapper = mountWithPinia(LoginView)
      const deviceInfo = wrapper.find('.device-info')
      expect(deviceInfo.exists()).toBe(true)
      expect(deviceInfo.text()).toContain('已检测到设备')
    })

    it('应该渲染登录按钮', () => {
      const wrapper = mountWithPinia(LoginView)
      const btn = wrapper.find('.btn-login')
      expect(btn.exists()).toBe(true)
      expect(btn.text()).toContain('验证并登录')
    })

    it('应该渲染底部链接', () => {
      const wrapper = mountWithPinia(LoginView)
      const links = wrapper.findAll('.footer-link')
      expect(links.length).toBe(4) // 使用帮助、联系客服、服务条款、管理员登录
    })
  })

  describe('授权码验证测试', () => {
    it('空授权码应该显示错误', async () => {
      const wrapper = mountWithPinia(LoginView)
      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect(mockShowToast).toHaveBeenCalledWith('请输入授权码', 'error')
      expect(mockVerifyAuthCode).not.toHaveBeenCalled()
    })

    it('授权码长度小于4应该显示格式错误', async () => {
      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      await input.setValue('AB')
      
      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect(mockShowToast).toHaveBeenCalledWith('授权码格式不正确，请检查后重试', 'error')
    })

    it('包含非法字符的授权码应该显示错误', async () => {
      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      await input.setValue('TEST@CODE!')
      
      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect(mockShowToast).toHaveBeenCalledWith('授权码只能包含字母、数字和连字符', 'error')
    })

    it('合法授权码应该调用验证接口', async () => {
      mockVerifyAuthCode.mockResolvedValue({ success: true, data: { token: 'test' } })
      
      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      await input.setValue('TEST-CODE-1234')
      
      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect(mockVerifyAuthCode).toHaveBeenCalledWith(
        'TEST-CODE-1234',
        'test-device-id-001',
        'Test-PC'
      )
    })
  })

  describe('登录流程测试', () => {
    it('登录成功应该保存信息并跳转', async () => {
      const mockUserData = { token: 'jwt-token', name: 'TestUser' }
      mockVerifyAuthCode.mockResolvedValue({
        success: true,
        data: mockUserData
      })

      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      await input.setValue('VALID-CODE-1234')

      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect(localStorage.setItem).toHaveBeenCalledWith('toolbox_role', 'user')
      expect(localStorage.setItem).toHaveBeenCalledWith('toolbox_token', 'jwt-token')
      expect(wrapper.find('.success-message').classes()).toContain('show')
      expect(mockShowToast).toHaveBeenCalledWith('授权成功！正在跳转...', 'success')

      vi.advanceTimersByTime(1200)
      expect(mockPush).toHaveBeenCalledWith('/user/dashboard')
    })

    it('登录失败应该显示错误信息', async () => {
      mockVerifyAuthCode.mockResolvedValue({
        success: false,
        message: '授权码无效或已过期'
      })

      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      await input.setValue('INVALID-CODE')

      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect(wrapper.find('.error-message').classes()).toContain('show')
      expect(wrapper.find('.error-message span').text()).toBe('授权码无效或已过期')
    })

    it('网络错误应该显示连接失败', async () => {
      mockVerifyAuthCode.mockRejectedValue(new Error('Network error'))

      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      await input.setValue('TEST-CODE-1234')

      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect(wrapper.find('.error-message').classes()).toContain('show')
      expect(wrapper.find('.error-message span').text()).toContain('网络连接失败')
    })

    it('登录过程中按钮应该显示加载状态', async () => {
      let resolvePromise
      mockVerifyAuthCode.mockReturnValue(new Promise(resolve => { resolvePromise = resolve }))

      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      await input.setValue('TEST-CODE-1234')

      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      const btn = wrapper.find('.btn-login')
      expect(btn.attributes('disabled')).toBeDefined()
      expect(btn.text()).toContain('验证中...')

      resolvePromise({ success: true, data: { token: 'test' } })
      await flushPromises()
    })
  })

  describe('帮助弹窗测试', () => {
    it('点击使用帮助应该显示弹窗', async () => {
      const wrapper = mountWithPinia(LoginView)
      const helpLink = wrapper.findAll('.footer-link')[0]
      await helpLink.trigger('click')

      expect(wrapper.find('.modal-overlay').classes()).toContain('show')
      expect(wrapper.find('.modal h3').text()).toContain('如何使用')
    })

    it('点击关闭按钮应该关闭弹窗', async () => {
      const wrapper = mountWithPinia(LoginView)
      // 先打开弹窗
      const helpLink = wrapper.findAll('.footer-link')[0]
      await helpLink.trigger('click')
      expect(wrapper.find('.modal-overlay').classes()).toContain('show')

      // 点击关闭
      const closeBtn = wrapper.find('.modal-close')
      await closeBtn.trigger('click')
      expect(wrapper.find('.modal-overlay').classes()).not.toContain('show')
    })

    it('点击"我知道了"应该关闭弹窗', async () => {
      const wrapper = mountWithPinia(LoginView)
      const helpLink = wrapper.findAll('.footer-link')[0]
      await helpLink.trigger('click')

      const confirmBtn = wrapper.find('.btn-confirm')
      await confirmBtn.trigger('click')
      expect(wrapper.find('.modal-overlay').classes()).not.toContain('show')
    })

    it('点击遮罩层应该关闭弹窗', async () => {
      const wrapper = mountWithPinia(LoginView)
      const helpLink = wrapper.findAll('.footer-link')[0]
      await helpLink.trigger('click')

      const overlay = wrapper.find('.modal-overlay')
      await overlay.trigger('click')
      expect(wrapper.find('.modal-overlay').classes()).not.toContain('show')
    })

    it('按 Escape 键应该关闭弹窗', async () => {
      const wrapper = mountWithPinia(LoginView)
      const helpLink = wrapper.findAll('.footer-link')[0]
      await helpLink.trigger('click')

      expect(wrapper.find('.modal-overlay').classes()).toContain('show')
      
      // 模拟点击遮罩层关闭（组件通过 @click.self 实现）
      const overlay = wrapper.find('.modal-overlay')
      await overlay.trigger('click')
      
      expect(wrapper.find('.modal-overlay').classes()).not.toContain('show')
    })
  })

  describe('联系客服测试', () => {
    it('点击联系客服应该显示微信信息', async () => {
      const wrapper = mountWithPinia(LoginView)
      const contactLink = wrapper.findAll('.footer-link')[1]
      await contactLink.trigger('click')

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('客服微信'),
        'info'
      )
    })
  })

  describe('无障碍测试', () => {
    it('授权码输入框应该有关联的 label', () => {
      const wrapper = mountWithPinia(LoginView)
      const label = wrapper.find('label[for="authCode"]')
      expect(label.exists()).toBe(true)
      expect(label.text()).toBe('授权码')
    })

    it('关闭按钮应该有 aria-label', () => {
      const wrapper = mountWithPinia(LoginView)
      const closeBtn = wrapper.find('.modal-close')
      expect(closeBtn.attributes('aria-label')).toBe('关闭')
    })

    it('底部导航应该有 aria-label', () => {
      const wrapper = mountWithPinia(LoginView)
      const nav = wrapper.find('nav.footer-links')
      expect(nav.attributes('aria-label')).toBe('其他操作')
    })

    it('登录按钮应该在加载时设置 aria-busy', async () => {
      mockVerifyAuthCode.mockReturnValue(new Promise(() => {}))

      const wrapper = mountWithPinia(LoginView)
      const input = wrapper.find('#authCode')
      await input.setValue('TEST-CODE-1234')

      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      const btn = wrapper.find('.btn-login')
      expect(btn.attributes('aria-busy')).toBe('true')
    })
  })
})