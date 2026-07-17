import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  createBusinessBatch: vi.fn(),
  createToolLaunchGrant: vi.fn(),
  finishBusinessBatch: vi.fn(),
  getBusinessBootstrap: vi.fn(),
  getBusinessBatches: vi.fn(),
  updateBusinessBatch: vi.fn(),
  updateBusinessBatchItem: vi.fn(),
}))

vi.mock('@/utils/api', () => apiMocks)

import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'

describe('business workspace sync outbox', () => {
  let emitBatchEvent: ((event: unknown) => void) | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    Object.values(apiMocks).forEach(mock => mock.mockReset())
    apiMocks.getBusinessBootstrap.mockResolvedValue({ entitlements: {}, tools: [] })
    apiMocks.updateBusinessBatch.mockResolvedValue({})
    apiMocks.finishBusinessBatch.mockResolvedValue({})
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        batch: {
          onEvent: vi.fn((listener: (event: unknown) => void) => {
            emitBatchEvent = listener
            return vi.fn()
          }),
          getSnapshot: vi.fn().mockResolvedValue({
            batchId: 'local-1',
            serverBatchId: 10,
            status: 'running',
            counts: { total: 1, running: 1 },
            items: [{
              itemId: 'item-1',
              accountLabelMasked: '客***1',
              status: 'running',
              browserReady: true,
            }],
          }),
        },
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the latest item status and retries after connectivity returns', async () => {
    apiMocks.updateBusinessBatchItem
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce({})

    const store = useBusinessWorkspaceStore()
    await store.init()
    emitBatchEvent?.({
      type: 'batch.item_updated',
      itemId: 'item-1',
      snapshot: {
        batchId: 'local-1',
        serverBatchId: 10,
        status: 'running',
        counts: { total: 1, waiting: 1 },
        items: [{
          itemId: 'item-1',
          accountLabelMasked: '客***1',
          status: 'waiting_user',
          interventionType: 'login',
          message: '请完成登录',
          browserReady: true,
        }],
      },
    })
    await vi.advanceTimersByTimeAsync(1)
    expect(store.syncState).toBe('offline')

    await vi.advanceTimersByTimeAsync(2_100)
    expect(apiMocks.updateBusinessBatchItem).toHaveBeenCalledTimes(2)
    expect(apiMocks.updateBusinessBatchItem).toHaveBeenLastCalledWith(
      10,
      'item-1',
      expect.objectContaining({ status: 'waiting_user', intervention_type: 'login' }),
    )
    expect(store.syncState).toBe('synced')
    store.dispose()
  })
})
