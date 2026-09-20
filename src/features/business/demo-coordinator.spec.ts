import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessDemoCoordinator } from './demo-coordinator'
import { businessToolSchema, emptyBatchSnapshot, type ImportPreview } from './model'

const api = vi.hoisted(() => ({
  createDemoBatch: vi.fn(),
  updateDemoBatch: vi.fn(),
  updateDemoBatchItem: vi.fn(),
  finishDemoBatch: vi.fn(),
}))
vi.mock('@/utils/api', () => api)

const tool = businessToolSchema.parse({ id: 'demo-tool', name: '批量演示', availability: 'demo_only' })
const preview: ImportPreview = {
  importId: 'import-1', validCount: 3, errors: [],
  rows: ['one', 'two', 'three'].map(itemId => ({ itemId, preview: { account_label: itemId } })),
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function harness() {
  let snapshot = emptyBatchSnapshot()
  const setError = vi.fn()
  const setSyncState = vi.fn()
  const refreshHistory = vi.fn().mockResolvedValue(undefined)
  const coordinator = new BusinessDemoCoordinator({
    getSnapshot: () => snapshot,
    setSnapshot: value => { snapshot = value },
    setError, setSyncState, refreshHistory,
  })
  return { coordinator, getSnapshot: () => snapshot, setError, setSyncState, refreshHistory }
}

describe('BusinessDemoCoordinator failure convergence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.values(api).forEach(mock => mock.mockReset())
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined })
    api.createDemoBatch.mockResolvedValue({ data: {
      id: 'server-demo', tool_id: tool.id, row_count: 3,
      items: ['one', 'two', 'three'].map(item_ref => ({ item_ref, status: 'queued', event_seq: 0 })),
    } })
    api.updateDemoBatch.mockResolvedValue({})
    api.updateDemoBatchItem.mockResolvedValue({})
    api.finishDemoBatch.mockResolvedValue({})
  })

  afterEach(() => vi.useRealTimers())

  it('terminalizes a partially started batch and ignores late item responses', async () => {
    const late = deferred<object>()
    api.updateDemoBatchItem.mockRejectedValueOnce(new Error('启动同步失败')).mockReturnValueOnce(late.promise)
    const state = harness()
    await expect(state.coordinator.start(tool, preview, 'local')).rejects.toThrow('演示已在本地停止')
    expect(state.getSnapshot()).toMatchObject({ status: 'error', counts: { running: 0, pending: 0, failed: 3 } })
    expect(state.getSnapshot().items.every(item => item.status === 'failed' && item.finishedAtMs)).toBe(true)
    expect(api.updateDemoBatch).toHaveBeenCalledExactlyOnceWith('server-demo', { event_seq: 1, status: 'error' })
    expect(state.setSyncState).toHaveBeenLastCalledWith('synced')
    late.resolve({ status: 'error' })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(6_000)
    expect(state.getSnapshot().status).toBe('error')
    expect(api.finishDemoBatch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('closes the server batch and local host if remapping fails before a local snapshot exists', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { batch: {
      remapImportItems: vi.fn().mockRejectedValue(new Error('导入已失效')), cancel,
    } } })
    const state = harness()
    await expect(state.coordinator.start(tool, preview, 'local')).rejects.toThrow('导入已失效')
    expect(api.updateDemoBatch).toHaveBeenCalledWith('server-demo', { event_seq: 1, status: 'error' })
    expect(cancel).toHaveBeenCalledWith('interrupted')
    expect(state.getSnapshot().status).toBe('idle')
  })

  it('uses a newer sequence after the initial running parent request fails', async () => {
    api.updateDemoBatch.mockRejectedValueOnce(new Error('响应丢失'))
    const state = harness()
    await expect(state.coordinator.start(tool, preview, 'local')).rejects.toThrow('响应丢失')
    expect(api.updateDemoBatch).toHaveBeenLastCalledWith('server-demo', { event_seq: 2, status: 'error' })
    expect(state.getSnapshot().counts.running).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves completed results but stops remaining accounts when playback synchronization fails', async () => {
    const state = harness()
    await state.coordinator.start(tool, preview, 'local')
    api.updateDemoBatchItem.mockImplementation(async (_batch, item, request) => {
      if (item === 'two' && request.event_seq === 2) throw new Error('网络连接失败')
      return {}
    })
    await vi.advanceTimersByTimeAsync(3_000)
    expect(state.getSnapshot()).toMatchObject({ status: 'error', counts: { completed: 1, running: 0, failed: 2 } })
    expect(state.getSnapshot().items.map(item => item.status)).toEqual(['completed', 'failed', 'failed'])
    expect(api.updateDemoBatch).toHaveBeenLastCalledWith('server-demo', { event_seq: 2, status: 'error' })
    const writes = api.updateDemoBatchItem.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.updateDemoBatchItem).toHaveBeenCalledTimes(writes)
    expect(api.finishDemoBatch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases local state within a finite timeout without promising persistent retries', async () => {
    api.updateDemoBatchItem.mockRejectedValueOnce(new Error('网络连接失败'))
    api.updateDemoBatch.mockReturnValue(new Promise(() => {}))
    const state = harness()
    const starting = state.coordinator.start(tool, preview, 'local')
    const rejected = expect(starting).rejects.toThrow('服务端记录尚未确认同步')
    await flushPromises()
    expect(state.getSnapshot().status).toBe('error')
    expect(state.getSnapshot().counts.running).toBe(0)
    await vi.advanceTimersByTimeAsync(2_500)
    await rejected
    expect(state.setSyncState).toHaveBeenLastCalledWith('offline')
    expect(state.setError).toHaveBeenLastCalledWith(expect.stringContaining('刷新记录核对'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not let an old cleanup response overwrite a newer run', async () => {
    const oldCleanup = deferred<object>()
    api.updateDemoBatch.mockReturnValueOnce(oldCleanup.promise)
    api.updateDemoBatchItem.mockRejectedValueOnce(new Error('旧批次失败'))
    const state = harness()
    const oldStart = state.coordinator.start(tool, preview, 'old').catch(() => undefined)
    await flushPromises()
    await state.coordinator.start(tool, preview, 'new')
    oldCleanup.resolve({})
    await oldStart
    expect(state.getSnapshot()).toMatchObject({ batchId: 'demo_new', status: 'running' })
    expect(state.setError).toHaveBeenLastCalledWith(null)
    state.coordinator.dispose()
  })

  it('does not mark a cancelled batch completed when its pending finish response arrives', async () => {
    const finish = deferred<object>()
    api.finishDemoBatch.mockReturnValue(finish.promise)
    const state = harness()
    await state.coordinator.start(tool, preview, 'local')
    await vi.advanceTimersByTimeAsync(6_000)
    expect(api.finishDemoBatch).toHaveBeenCalledOnce()
    await state.coordinator.cancel()
    finish.resolve({})
    await flushPromises()
    expect(state.getSnapshot().status).toBe('cancelled')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not write terminal state when batch creation itself fails', async () => {
    api.createDemoBatch.mockRejectedValueOnce(new Error('无可用授权'))
    const state = harness()
    await expect(state.coordinator.start(tool, preview, 'local')).rejects.toThrow('无可用授权')
    expect(api.updateDemoBatch).not.toHaveBeenCalled()
    expect(state.getSnapshot().status).toBe('idle')
  })
})
