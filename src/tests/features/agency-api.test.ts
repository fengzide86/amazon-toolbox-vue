import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agencyApi } from '@/features/agency/api'
import { orderSchema, pageSchema, customerSchema, statusLabel, requestKindLabel, money } from '@/features/agency/model'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), download: vi.fn() }))
vi.mock('@/utils/api', () => ({ api: mocks }))
vi.mock('@/utils/api/download', () => ({ downloadApiFile: mocks.download }))

const agency = { id: 1, name: '授权代理', status: 'active', created_at: '2026-09-21T01:00:00Z' }
const customer = { id: 2, agency_id: 1, name: '测试客户', created_at: agency.created_at }
const license = { id: 4, agency_id: 1, customer_id: 2, order_id: 3, code: 'TEST-LICENSE', plan_name: '测试套餐', status: 'unused', activated: false, created_at: agency.created_at }
const order = { id: 3, agency_id: 1, customer_id: 2, customer_name: '测试客户', order_no: 'TEST-ORDER', plan_id: 5, plan_name: '测试套餐', amount: 100, status: 'paid', created_at: agency.created_at, auth_code: license }
const request = { id: 6, agency_id: 1, customer_id: 2, kind: 'support', content: '需要协助', status: 'open', created_at: agency.created_at }
beforeEach(() => vi.resetAllMocks())

describe('scoped agency API contracts', () => {
  it.each([['agencies', agency], ['customers', customer], ['orders', order], ['licenses', license], ['requests', request]] as const)('keeps total and data from the %s raw envelope', async (section, row) => {
    mocks.get.mockResolvedValue({ success: true, data: [row], total: 53, page: 2, page_size: 20 })
    const result = await agencyApi[section]({ page: 2, page_size: 20, q: '测试' })
    expect(result.total).toBe(53)
    expect(result.data).toHaveLength(1)
    expect(mocks.get).toHaveBeenCalledWith(`/api/agency/${section}`, { page: 2, page_size: 20, q: '测试' }, { cache: false, responseMode: 'raw' })
  })
  it('parses summary and current plans without using internal admin endpoints', async () => {
    mocks.get.mockResolvedValueOnce({ customers: 2, orders: 1, pending_orders: 0, delivered_orders: 1, open_requests: 0 })
    expect((await agencyApi.summary()).delivered_orders).toBe(1)
    mocks.get.mockResolvedValueOnce([{ id: 1, name: '套餐', price: 10, duration_days: 30, product_type: 'consumer' }])
    expect((await agencyApi.plans())[0]?.price).toBe(10)
  })
  it('parses POST envelopes and PATCH data consistently', async () => {
    mocks.post.mockResolvedValueOnce({ data: agency })
    expect((await agencyApi.createAgency({ name: agency.name })).id).toBe(1)
    mocks.patch.mockResolvedValueOnce({ ...agency, status: 'disabled' })
    expect((await agencyApi.updateAgency(1, { status: 'disabled' })).status).toBe('disabled')
    mocks.post.mockResolvedValueOnce({ data: customer })
    expect((await agencyApi.createCustomer({ name: customer.name })).agency_id).toBe(1)
    mocks.patch.mockResolvedValueOnce({ ...customer, agency_id: 9 })
    expect((await agencyApi.updateCustomer(2, { agency_id: 9 })).agency_id).toBe(9)
    mocks.post.mockResolvedValueOnce({ data: order })
    expect((await agencyApi.createOrder({ customer_id: 2, plan_id: 5, platform_key: 'amazon' })).order_no).toBe('TEST-ORDER')
    mocks.post.mockResolvedValueOnce({ data: order })
    expect((await agencyApi.markPaid(3)).status).toBe('paid')
    mocks.post.mockResolvedValueOnce({ data: order })
    expect((await agencyApi.deliver(3)).auth_code?.code).toBe('TEST-LICENSE')
    mocks.post.mockResolvedValueOnce({ data: request })
    expect((await agencyApi.createRequest({ customer_id: 2, kind: 'support', content: '需要协助' })).status).toBe('open')
    mocks.patch.mockResolvedValueOnce({ ...request, status: 'resolved', response: '已答复' })
    expect((await agencyApi.respond(6, { status: 'resolved', response: '已答复' })).response).toBe('已答复')
  })
  it('exports through the checked file-download client using current scope filters', async () => {
    const blob = new Blob(['订单编号,金额'])
    mocks.download.mockResolvedValue(blob)
    expect(await agencyApi.exportOrders({ agency_id: 1, status: 'paid' })).toBe(blob)
    expect(mocks.download).toHaveBeenCalledWith('/api/agency/orders/export', { agency_id: 1, status: 'paid' })
  })
  it('does not disguise malformed responses as empty data or drop nullable archived plans', async () => {
    expect(orderSchema.parse({ ...order, plan_id: null }).plan_id).toBeNull()
    expect(pageSchema(customerSchema).safeParse({ data: [], page: 1, page_size: 20 }).success).toBe(false)
    mocks.get.mockResolvedValue({ data: null, total: 0, page: 1, page_size: 20 })
    await expect(agencyApi.customers()).rejects.toThrow()
  })
  it('uses understandable status and currency labels', () => {
    expect(statusLabel('pending')).toBe('待确认收款')
    expect(statusLabel('refunded')).toBe('已退款')
    expect(requestKindLabel('extension')).toBe('延期申请')
    expect(money(99.5)).toContain('99.50')
  })
})
