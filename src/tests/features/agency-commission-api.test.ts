import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agencyApi } from '@/features/agency/api'
const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('@/utils/api', () => ({ api: mocks }))
const revision = 'a'.repeat(64)
beforeEach(() => vi.resetAllMocks())
describe('返佣 API contracts', () => {
  it('parses decimal strings and preserves nullable rate', async () => {
    mocks.get.mockResolvedValueOnce({ data: { agency_id: 4, rate: null } }).mockResolvedValueOnce({ data: { pending_amount: '12.34', settled_amount: 3, accrued_amount: 20, refunded_amount: '-1.23' } })
    await expect(agencyApi.commissionPolicy(4)).resolves.toEqual({ agency_id: 4, rate: null })
    await expect(agencyApi.commissionSummary(4)).resolves.toEqual({ pending_amount: 12.34, settled_amount: 3, accrued_amount: 20, refunded_amount: -1.23 })
  })
  it('rejects malformed month/revision instead of coercing them', async () => {
    await expect(agencyApi.commissionPreview(1, '本月')).rejects.toThrow()
    await expect(agencyApi.confirmCommissionSettlement(1, { month: '2026-09', expected_revision: 'bad', note: '核对' })).rejects.toThrow()
  })
  it('sends the loaded nullable CAS value and validates response', async () => {
    mocks.put.mockResolvedValue({ data: { agency_id: 4, rate: '0.25' } })
    await expect(agencyApi.updateCommissionPolicy(4, 0.25, null)).resolves.toEqual({ agency_id: 4, rate: 0.25 })
    expect(mocks.put).toHaveBeenCalledWith('/api/agency/agencies/4/commission-policy', { rate: 0.25, expected_rate: null })
    mocks.post.mockResolvedValue({ data: { id: 1, agency_id: 4, month: '2026-09', amount: '2.00', count: 1, confirmed_at: '2026-09-22T00:00:00Z', note: '核对' } })
    await expect(agencyApi.confirmCommissionSettlement(4, { month: '2026-09', expected_revision: revision, note: '核对' })).resolves.toMatchObject({ amount: 2, agency_id: 4 })
  })
})
