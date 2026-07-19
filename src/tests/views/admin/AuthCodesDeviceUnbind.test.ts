import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import AuthCodesView from '@/views/admin/AuthCodesView.vue'
import { mountWithPinia } from '@/tests/helpers'
import { authService } from '@/utils/auth'

const mocks = vi.hoisted(() => ({
  getAuthCodes: vi.fn(),
  getPlansAdmin: vi.fn(),
  apiGet: vi.fn(),
  unbindDevice: vi.fn(),
  prompt: vi.fn(),
  showToast: vi.fn(),
  routerReplace: vi.fn(),
}))

vi.mock('@/utils/api', () => ({
  getAuthCodes: (...args: unknown[]) => mocks.getAuthCodes(...args),
  getPlansAdmin: (...args: unknown[]) => mocks.getPlansAdmin(...args),
  batchGenerateAuthCodes: vi.fn(),
  updateAuthCode: vi.fn(),
  deleteAuthCode: vi.fn(),
  unbindDevice: (...args: unknown[]) => mocks.unbindDevice(...args),
  api: { get: (...args: unknown[]) => mocks.apiGet(...args) },
}))

vi.mock('@/utils', () => ({
  showToast: (...args: unknown[]) => mocks.showToast(...args),
}))

vi.mock('element-plus', () => ({
  ElMessageBox: { prompt: (...args: unknown[]) => mocks.prompt(...args) },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: { value: { query: {} } },
    replace: mocks.routerReplace,
  }),
}))

const code = {
  id: 5,
  code: 'SUPPORT-DEVICE-001',
  plan_id: 1,
  plan_name: '演示套餐',
  max_devices: 2,
  status: 'active',
  devices: [{ id: 17, device_id: 'device-17', device_name: '客服测试设备', created_at: '2026-07-18T00:00:00Z' }],
  platform_scope: ['amazon'],
  seat_limit: 1,
  seat_used: 1,
  device_used: 1,
  product_type: 'consumer',
  entitlements: {},
}

describe('授权码详情设备解绑 UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authService.setRole('support')
    mocks.getAuthCodes.mockResolvedValue([code])
    mocks.getPlansAdmin.mockResolvedValue([])
    mocks.apiGet.mockResolvedValue(code)
    mocks.unbindDevice.mockResolvedValue({ success: true })
    mocks.prompt.mockResolvedValue({ value: '客户换机' })
  })

  it('客服可在详情中填写原因并解绑，随后刷新列表和详情', async () => {
    const wrapper = mountWithPinia(AuthCodesView, {
      global: {
        stubs: {
          RouterLink: true,
          PageHeader: { template: '<header><slot name="actions"/><slot/></header>' },
          DataToolbar: { template: '<div><slot/><slot name="summary"/><slot name="actions"/></div>' },
          AdminDetailDrawer: { template: '<section><slot/><slot name="footer"/></section>' },
          'el-card': { template: '<section><slot name="header"/><slot/></section>' },
          'el-table': true,
          'el-table-column': true,
          'el-dialog': true,
          'el-select': true,
          'el-option': true,
          'el-input': true,
          'el-input-number': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true,
          'el-tag': { template: '<span><slot/></span>' },
          'el-button': {
            emits: ['click'],
            template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot/></button>',
          },
        },
        directives: {
          loading: {},
        },
      },
    })
    await flushPromises()

    await (wrapper.vm as unknown as { openDetail: (value: unknown) => Promise<void> }).openDetail(code)
    await flushPromises()
    const button = wrapper.find('[data-testid="unbind-device-17"]')
    expect(button.exists()).toBe(true)

    await button.trigger('click')
    await flushPromises()

    expect(mocks.prompt).toHaveBeenCalled()
    expect(mocks.unbindDevice).toHaveBeenCalledWith(17, '客户换机')
    expect(mocks.getAuthCodes).toHaveBeenCalledTimes(2)
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(mocks.showToast).toHaveBeenCalledWith('设备已解绑', 'success')
  })
})
