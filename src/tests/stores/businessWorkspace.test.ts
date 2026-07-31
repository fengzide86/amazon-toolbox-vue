import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  createBusinessBatch: vi.fn(),
  createDemoBatch: vi.fn(),
  createToolLaunchGrant: vi.fn(),
  finishDemoBatch: vi.fn(),
  finishBusinessBatch: vi.fn(),
  getBusinessBootstrap: vi.fn(),
  getBusinessBatches: vi.fn(),
  getDemoBatches: vi.fn(),
  updateDemoBatch: vi.fn(),
  updateDemoBatchItem: vi.fn(),
  updateBusinessBatch: vi.fn(),
  updateBusinessBatchItem: vi.fn(),
}))

vi.mock('@/utils/api', () => apiMocks)

import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'

describe('business workspace sync outbox', () => {
  let emitBatchEvent: ((event: unknown) => void) | undefined
  let electronBatch: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    Object.values(apiMocks).forEach(mock => mock.mockReset())
    apiMocks.getBusinessBootstrap.mockResolvedValue({ entitlements: {}, tools: [] })
    apiMocks.getDemoBatches.mockResolvedValue([])
    apiMocks.updateBusinessBatch.mockResolvedValue({})
    apiMocks.finishBusinessBatch.mockResolvedValue({})
    apiMocks.updateDemoBatch.mockResolvedValue({})
    apiMocks.updateDemoBatchItem.mockResolvedValue({})
    apiMocks.finishDemoBatch.mockResolvedValue({})
    electronBatch = {
      onEvent: vi.fn((listener: (event: unknown) => void) => {
        emitBatchEvent = listener
        return vi.fn()
      }),
      getSnapshot: vi.fn().mockResolvedValue({ status: 'idle', recordKind: 'live', items: [] }),
      cancel: vi.fn().mockResolvedValue({ status: 'cancelled', items: [] }),
      loadSampleImport: vi.fn(),
      remapImportItems: vi.fn(),
      create: vi.fn(),
      start: vi.fn(),
    }
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        batch: electronBatch,
        demoActivity: { setActive: vi.fn().mockResolvedValue(undefined) },
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the latest item status and retries after connectivity returns', async () => {
    electronBatch.getSnapshot.mockResolvedValue({
      batchId: 'local-1',
      serverBatchId: 10,
      status: 'running',
      recordKind: 'live',
      counts: { total: 1, running: 1 },
      items: [{
        itemId: 'item-1',
        accountLabelMasked: '客***1',
        status: 'running',
        browserReady: true,
      }],
    })
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

  it('keeps history failures separate from workspace bootstrap state', async () => {
    apiMocks.getDemoBatches.mockRejectedValue(new Error('history unavailable'))
    const store = useBusinessWorkspaceStore()
    await store.init()

    await expect(store.loadDemoHistory()).rejects.toThrow('history unavailable')
    expect(store.historyError).toBe('history unavailable')
    expect(store.error).toBeNull()
    expect(store.bootstrap).not.toBeNull()
    store.dispose()
  })

  it.each([8, 50])('starts %i demo accounts together without starting runner sessions', async count => {
    const tool = {
      id: 'demo-tool',
      name: '批量演示工具',
      availability: 'demo_only',
      demo_scenario_id: 'concurrent-demo',
      script_key: 'demo.concurrent',
    }
    const itemIds = Array.from({ length: count }, (_, index) => `server-item-${index + 1}`)
    apiMocks.getBusinessBootstrap.mockResolvedValue({ entitlements: { max_batch_rows: 50 }, tools: [tool] })
    apiMocks.createDemoBatch.mockResolvedValue({
      data: {
        id: 'demo-batch-1',
        tool_id: 'demo-tool',
        row_count: count,
        items: itemIds.map(item_ref => ({ item_ref, status: 'queued', event_seq: 0 })),
      },
    })
    electronBatch.loadSampleImport.mockResolvedValue({
      importId: 'sample-import',
      validCount: count,
      errorCount: 0,
      rows: itemIds.map((itemId, index) => ({ itemId, preview: { account_label: `账号 ${index + 1}` } })),
      errors: [],
    })
    electronBatch.remapImportItems.mockResolvedValue({
      importId: 'remapped-import',
      validCount: count,
      errorCount: 0,
      rows: itemIds.map((itemId, index) => ({ itemId, preview: { account_label: `账号 ${index + 1}` } })),
      errors: [],
    })
    electronBatch.create.mockResolvedValue({
      batchId: 'local-demo',
      serverBatchId: 'demo-batch-1',
      status: 'running',
      recordKind: 'demo',
      counts: { total: count, pending: count, running: 0 },
      items: itemIds.map((itemId, index) => ({
        itemId,
        accountLabelMasked: `账***${index + 1}`,
        status: 'pending',
        browserReady: false,
      })),
    })

    const store = useBusinessWorkspaceStore()
    await store.init()
    store.chooseTool(store.tools[0])
    await store.loadSampleImport()
    await store.startBatch()

    expect(store.snapshot.counts.running).toBe(count)
    expect(store.items.every(item => item.status === 'running')).toBe(true)
    expect(apiMocks.updateDemoBatchItem).toHaveBeenCalledTimes(count)
    expect(electronBatch.start).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(6_000)
    expect(store.snapshot.status).toBe('completed')
    expect(apiMocks.finishDemoBatch).toHaveBeenCalledOnce()
    store.dispose()
  })

  it('locally exits an active demo even when persistence does not respond', async () => {
    const tool = { id: 'demo-tool', name: '批量演示工具', availability: 'demo_only', demo_scenario_id: 'demo' }
    apiMocks.getBusinessBootstrap.mockResolvedValue({ entitlements: {}, tools: [tool] })
    apiMocks.createDemoBatch.mockResolvedValue({ data: {
      id: 'demo-batch-exit', tool_id: 'demo-tool', row_count: 2,
      items: ['one', 'two'].map(item_ref => ({ item_ref, status: 'queued', event_seq: 0 })),
    } })
    electronBatch.loadSampleImport.mockResolvedValue({ importId: 'source', validCount: 2, rows: [], errors: [] })
    electronBatch.remapImportItems.mockResolvedValue({ importId: 'mapped', validCount: 2, rows: [], errors: [] })
    electronBatch.create.mockResolvedValue({
      batchId: 'local-exit', serverBatchId: 'demo-batch-exit', status: 'running', recordKind: 'demo', counts: { total: 2 },
      items: ['one', 'two'].map(itemId => ({ itemId, accountLabelMasked: itemId, status: 'pending', browserReady: false })),
    })
    const never = new Promise(() => {})
    apiMocks.updateDemoBatch.mockResolvedValueOnce({}).mockReturnValueOnce(never)

    const store = useBusinessWorkspaceStore()
    await store.init()
    store.chooseTool(store.tools[0])
    await store.loadSampleImport()
    await store.startBatch()
    const exitPromise = store.cancelBatch('cancelled')
    await vi.advanceTimersByTimeAsync(2_500)
    await exitPromise

    expect(store.snapshot.status).toBe('cancelled')
    expect(store.items.every(item => item.status === 'cancelled')).toBe(true)
    expect(store.syncState).toBe('offline')
    store.dispose()
  })
})
