import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import OrdersView from '@/views/admin/OrdersView.vue'
import { mountWithPinia } from '@/tests/helpers'
import { authService } from '@/utils/auth'
import { usePlatformStore } from '@/stores/platform'
import type { AdminOrder } from '@/features/admin/model'

const mocks = vi.hoisted(() => ({ page: vi.fn(), plans: vi.fn(), export: vi.fn(), toast: vi.fn() }))
vi.mock('@/utils/api', () => ({
  getOrdersPage: (...args: unknown[]) => mocks.page(...args),
  getPlansAdmin: (...args: unknown[]) => mocks.plans(...args),
  exportOrders: (...args: unknown[]) => mocks.export(...args),
  createOrder: vi.fn(), markOrderPaid: vi.fn(), cancelOrder: vi.fn(), refundOrder: vi.fn(),
}))
vi.mock('@/utils', () => ({ showToast: (...args: unknown[]) => mocks.toast(...args) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('element-plus', () => ({ ElMessageBox: { prompt: vi.fn() } }))

const order = (id: number, status = 'pending') => ({ id, order_no: `ORDER-${id}`, amount: 99, status })
const result = (id: number, total = 41) => ({ items: [order(id)], total, page: 1, page_size: 20 })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function mountOrders() {
  return mountWithPinia(OrdersView, { global: { stubs: {
    PageHeader: true, AsyncStateNotice: true, AdminDetailDrawer: true,
    DataToolbar: { template: '<div><slot/><slot name="summary"/><slot name="actions"/></div>' },
    'el-card': { template: '<section><slot name="header"/><slot/></section>' },
    'el-table': true, 'el-table-column': true, 'el-select': true, 'el-option': true,
    'el-input': true, 'el-tag': true, 'el-dropdown': true,
    'el-pagination': { props: ['currentPage', 'total', 'pageSize'], emits: ['current-change'], template: '<button data-testid="next-page" @click="$emit(\'current-change\', 2)">下一页</button>' },
    'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot/></button>' },
  } } })
}
interface OrderViewState {
  orders: AdminOrder[]; total: number; page: number; filterStatus: string; loadError: string
  changePage: (page: number) => void; exportOrdersData: () => Promise<void>
}

describe('订单远端分页与筛选一致性', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    authService.setRole('operator')
    mocks.page.mockResolvedValue(result(1))
    mocks.plans.mockResolvedValue([])
  })

  it('显示后端全部数量并请求第二页，不把第一页当全部', async () => {
    const wrapper = mountOrders()
    await flushPromises()
    expect(wrapper.text()).toContain('共 41 笔 · 本页 1 笔')
    expect(wrapper.text()).toContain('本页待收款')
    await wrapper.get('[data-testid="next-page"]').trigger('click')
    await flushPromises()
    expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, page_size: 20 }))
    wrapper.unmount()
  })

  it('状态筛选交给后端并重置页码，导出使用同一平台与状态', async () => {
    const wrapper = mountOrders()
    await flushPromises()
    const state = wrapper.vm as unknown as OrderViewState
    state.changePage(2)
    await flushPromises()
    state.filterStatus = 'paid'
    usePlatformStore().setAdminPlatform('amazon')
    await flushPromises()
    expect(mocks.page).toHaveBeenLastCalledWith({ page: 1, page_size: 20, status: 'paid', platform_key: 'amazon' })
    // Deliberately reject before browser download; the request must still use the exact visible scope.
    mocks.export.mockRejectedValue(new Error('offline'))
    await state.exportOrdersData()
    expect(mocks.export).toHaveBeenCalledWith({ status: 'paid', platform_key: 'amazon' })
    wrapper.unmount()
  })

  it.each(['success', 'failure'] as const)('旧平台的慢请求 %s 不覆盖新平台', async (outcome) => {
    const slow = deferred<ReturnType<typeof result>>()
    mocks.page.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(result(2, 7))
    const wrapper = mountOrders()
    const state = wrapper.vm as unknown as OrderViewState
    usePlatformStore().setAdminPlatform('aliexpress')
    await flushPromises()
    if (outcome === 'success') slow.resolve(result(1))
    else slow.reject(new Error('old request failed'))
    await flushPromises()
    expect(state.orders[0]?.id).toBe(2)
    expect(state.total).toBe(7)
    expect(state.loadError).toBe('')
    wrapper.unmount()
  })

  it('页面卸载后不应用仍在等待的请求', async () => {
    const slow = deferred<ReturnType<typeof result>>()
    mocks.page.mockReturnValueOnce(slow.promise)
    const wrapper = mountOrders()
    const state = wrapper.vm as unknown as OrderViewState
    wrapper.unmount()
    slow.resolve(result(1))
    await flushPromises()
    expect(state.orders).toEqual([])
  })
})
