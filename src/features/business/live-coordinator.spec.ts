import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessLiveCoordinator } from './live-coordinator'
import type { BusinessBatchSnapshot } from './model'

const api = vi.hoisted(() => ({
  createBusinessBatch: vi.fn(), createToolLaunchGrant: vi.fn(), finishBusinessBatch: vi.fn(),
  getBusinessBatch: vi.fn(),
  updateBusinessBatch: vi.fn(), updateBusinessBatchItem: vi.fn(),
}))
vi.mock('@/utils/api', () => api)

describe('BusinessLiveCoordinator terminal convergence', () => {
  let emit: (event: unknown) => void
  let snapshot: BusinessBatchSnapshot
  let coordinator: BusinessLiveCoordinator

  beforeEach(async () => {
    vi.useFakeTimers()
    Object.values(api).forEach(mock => mock.mockReset().mockResolvedValue({}))
    api.getBusinessBatch.mockResolvedValue({ id: 1, client_batch_id: 'batch-1' })
    snapshot = { batchId: 'batch-1', serverBatchId: 1, status: 'running', recordKind: 'live', counts: { total: 1, running: 1 },
      items: [{ itemId: 'row', accountLabelMasked: '客户', status: 'running', browserReady: true }] }
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { batch: {
      onEvent: vi.fn(listener => { emit = listener; return vi.fn() }),
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
    } } })
    coordinator = new BusinessLiveCoordinator({
      getOwnerScope: () => 'owner-1',
      getSnapshot: () => snapshot,
      setSnapshot: next => { snapshot = next },
      getSelectedTool: () => null, selectItem: vi.fn(), setSyncState: vi.fn(), setError: vi.fn(),
    })
    await coordinator.initialize()
  })

  afterEach(() => {
    coordinator.dispose()
    vi.useRealTimers()
  })

  it.each(['completed', 'cancelled', 'interrupted'])('persists final rows before %s and never sends a later running summary', async status => {
    emit({ type: 'batch.item_updated', itemId: 'row', snapshot: { ...snapshot } })
    const final = { ...snapshot, status, counts: { total: 1, completed: status === 'completed' ? 1 : 0 },
      items: [{ ...snapshot.items[0], status: status === 'completed' ? 'completed' : 'cancelled' }] }
    emit({ type: 'batch.finished', snapshot: final })
    expect(await coordinator.flushWithin(100)).toBe(true)
    const lastItemCall = api.updateBusinessBatchItem.mock.calls.at(-1)
    expect(lastItemCall?.[2]).toMatchObject({ status: status === 'completed' ? 'completed' : 'cancelled' })
    expect(api.finishBusinessBatch).toHaveBeenCalledWith(1, status)
    const finishOrder = api.finishBusinessBatch.mock.invocationCallOrder[0]
    expect(finishOrder).toBeDefined()
    if (finishOrder === undefined) throw new Error('finish request missing')
    expect(api.updateBusinessBatchItem.mock.invocationCallOrder.at(-1)).toBeLessThan(finishOrder)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.updateBusinessBatch).not.toHaveBeenCalled()
    // A late Runner event cannot revive an already-sealed local snapshot.
    emit({ type: 'batch.item_updated', itemId: 'row', snapshot: { ...final, status: 'running' } })
    expect(snapshot.status).toBe(status)
  })

  it('disposal clears heartbeat and pending summary timers', async () => {
    emit({ type: 'batch.runner_event', snapshot: { ...snapshot } })
    coordinator.dispose()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.updateBusinessBatch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
