import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createDemoRun: vi.fn(), getDemoRun: vi.fn(), updateDemoRun: vi.fn(), finishDemoRun: vi.fn(), cancelDemoRun: vi.fn(), getAuth: vi.fn(), getApiBase: vi.fn() }))
vi.mock('@/utils/api', () => mocks)
vi.mock('@/utils/auth', () => ({ authService: { getAuth: mocks.getAuth } }))
vi.mock('@/shared/api/base', () => ({ getApiBase: mocks.getApiBase }))

const receipt = { localId: 'local-1', toolId: 'tool', toolName: '工具', platform: 'amazon', scenario: 'default', status: 'completed' as const, completedSteps: 6 }
const snapshot = (status = 'created', sequence = 0) => ({ id: 'server-1', tool_id: 'tool', status, event_seq: sequence, total_step_count: 6 })

describe('single Demo durable receipt reconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    localStorage.clear()
    mocks.getAuth.mockReturnValue({ token: `header.${btoa(JSON.stringify({ user_id: 1, auth_code_id: 2, device_id: 'device' }))}.signature` })
    mocks.getApiBase.mockReturnValue('https://test.invalid')
    mocks.createDemoRun.mockResolvedValue(snapshot())
    mocks.getDemoRun.mockResolvedValue(snapshot('running', 1))
    mocks.updateDemoRun.mockResolvedValue(snapshot('running', 1))
    mocks.finishDemoRun.mockResolvedValue(snapshot('completed', 2))
  })

  it('persists only receipt metadata and uses the current server sequence', async () => {
    const { queueDemoReceipt } = await import('@/features/automation/demo-receipts')
    mocks.getDemoRun.mockResolvedValue(snapshot('running', 7))
    expect(await queueDemoReceipt({ ...receipt, remoteId: 'server-1' })).toBe(true)
    expect(mocks.updateDemoRun).not.toHaveBeenCalled()
    expect(mocks.finishDemoRun).toHaveBeenCalledWith('server-1', { event_seq: 8, completed_step_count: 6 })
  })

  it('clears an acknowledged completion after its first response was lost without rerunning or replaying old events', async () => {
    let module = await import('@/features/automation/demo-receipts')
    mocks.finishDemoRun.mockRejectedValueOnce(new Error('response lost'))
    expect(await module.queueDemoReceipt(receipt)).toBe(false)
    expect(mocks.finishDemoRun).toHaveBeenCalledTimes(1)
    const stored = localStorage.getItem(localStorage.key(0)!)!
    expect(stored).toContain('server-1')
    expect(stored).not.toContain('signature')
    vi.resetModules()
    module = await import('@/features/automation/demo-receipts')
    mocks.getDemoRun.mockResolvedValue(snapshot('completed', 2))
    await module.flushPendingDemoReceipts()
    expect(mocks.finishDemoRun).toHaveBeenCalledTimes(1)
    expect(mocks.updateDemoRun).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(localStorage.key(0)!)).toBe('[]')
  })

  it('recovers a lost create response using the original idempotency key', async () => {
    const { queueDemoReceipt, flushPendingDemoReceipts } = await import('@/features/automation/demo-receipts')
    mocks.createDemoRun.mockRejectedValueOnce(new Error('create response lost')).mockResolvedValueOnce(snapshot('running', 4))
    expect(await queueDemoReceipt(receipt)).toBe(false)
    await flushPendingDemoReceipts()
    expect(mocks.createDemoRun.mock.calls.map(call => call[0].client_demo_run_id)).toEqual(['local-1', 'local-1'])
    expect(mocks.finishDemoRun).toHaveBeenCalledWith('server-1', { event_seq: 5, completed_step_count: 6 })
  })

  it('keeps a conflicting terminal record pending instead of overwriting it', async () => {
    const { queueDemoReceipt } = await import('@/features/automation/demo-receipts')
    mocks.getDemoRun.mockResolvedValue(snapshot('cancelled', 8))
    expect(await queueDemoReceipt({ ...receipt, remoteId: 'server-1' })).toBe(false)
    expect(mocks.finishDemoRun).not.toHaveBeenCalled()
    expect(localStorage.getItem(localStorage.key(0)!)).toContain('local-1')
  })

  it('does not send old receipts to a different control-plane origin', async () => {
    const { queueDemoReceipt, flushPendingDemoReceipts } = await import('@/features/automation/demo-receipts')
    mocks.createDemoRun.mockRejectedValue(new Error('offline'))
    await queueDemoReceipt(receipt)
    mocks.getApiBase.mockReturnValue('https://other.invalid')
    await flushPendingDemoReceipts()
    expect(mocks.createDemoRun).toHaveBeenCalledTimes(1)
  })

  it.each(['failed', 'cancelled'] as const)('reconciles %s with a monotonic event after restart', async status => {
    const { queueDemoReceipt } = await import('@/features/automation/demo-receipts')
    mocks.getDemoRun.mockResolvedValue(snapshot('paused', 9))
    expect(await queueDemoReceipt({ ...receipt, status, completedSteps: 2, remoteId: 'server-1' })).toBe(true)
    if (status === 'cancelled') expect(mocks.cancelDemoRun).toHaveBeenCalledWith('server-1', 10)
    else expect(mocks.updateDemoRun).toHaveBeenCalledWith('server-1', expect.objectContaining({ status: 'error', event_seq: 10 }))
  })
})
