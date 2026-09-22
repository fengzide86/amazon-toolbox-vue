import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AgentCommissionView from '@/features/agency/AgentCommissionView.vue'

const mocks = vi.hoisted(() => ({
  commissionSummary: vi.fn(), commissionEntries: vi.fn(), commissionSettlements: vi.fn(),
}))
vi.mock('@/features/agency/api', () => ({ agencyApi: mocks }))
vi.mock('@/utils/auth', () => ({ authService: { getUser: () => ({ agency_id: 7 }) } }))

const entry = { id: 1, agency_id: 7, order_id: 12, order_no: 'KST-0012', kind: 'accrual', amount: 12.34, rate_snapshot: 0.1, order_amount_snapshot: 123.4, occurred_at: '2026-09-22T02:00:00Z', settlement_id: null }
const settlement = { id: 3, agency_id: 7, month: '2026-09', amount: 12.34, count: 1, confirmed_at: '2026-09-22T03:00:00Z', note: '线下核对' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.commissionSummary.mockResolvedValue({ pending_amount: 12.34, settled_amount: 0, accrued_amount: 12.34, refunded_amount: 0 })
  mocks.commissionEntries.mockResolvedValue({ data: [entry], total: 1, page: 1, page_size: 20 })
  mocks.commissionSettlements.mockResolvedValue({ data: [settlement], total: 1, page: 1, page_size: 20 })
})

describe('代理返佣只读账本', () => {
  it('显示汇总、订单关联和线下结算记录，刷新会同时刷新三块数据', async () => {
    const wrapper = mount(AgentCommissionView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('KST-0012')
    expect(wrapper.text()).toContain('待结算')
    expect(wrapper.text()).toContain('2026-09')
    expect(mocks.commissionSummary).toHaveBeenCalledWith(7)
    expect(mocks.commissionEntries).toHaveBeenCalledWith(7, { page: 1, page_size: 20, settled: undefined })
    expect(mocks.commissionSettlements).toHaveBeenCalledWith(7, { page: 1, page_size: 20 })

    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mocks.commissionSummary).toHaveBeenCalledTimes(2)
    expect(mocks.commissionEntries).toHaveBeenCalledTimes(2)
    expect(mocks.commissionSettlements).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('请求失败时不把汇总伪装成零，并清空过期明细', async () => {
    mocks.commissionSummary.mockRejectedValueOnce(new Error('汇总失败'))
    mocks.commissionEntries.mockRejectedValueOnce(new Error('明细失败'))
    mocks.commissionSettlements.mockRejectedValueOnce(new Error('结算失败'))
    const wrapper = mount(AgentCommissionView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const cards = wrapper.findAll('.summary-card strong').map(node => node.text())
    expect(cards).toEqual(['—', '—', '—', '—'])
    expect(wrapper.text()).toContain('汇总失败')
    expect(wrapper.text()).toContain('明细失败')
    expect(wrapper.text()).toContain('结算失败')
    expect(wrapper.text()).not.toContain('KST-0012')
    wrapper.unmount()
  })
})
