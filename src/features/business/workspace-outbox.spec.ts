import { afterEach, describe, expect, it, vi } from 'vitest'

import { BusinessWorkspaceOutbox, type WorkspaceSyncState } from './workspace-outbox'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('BusinessWorkspaceOutbox', () => {
  it('serializes item, summary, and finish updates', async () => {
    const calls: string[] = []
    const states: WorkspaceSyncState[] = []
    const outbox = new BusinessWorkspaceOutbox({
      updateItem: async () => { calls.push('item') },
      updateBatch: async () => { calls.push('batch') },
      finishBatch: async () => { calls.push('finish') },
      onState: state => states.push(state),
    })
    outbox.queueFinish({ batchId: 1, status: 'completed' })
    outbox.queueItem({
      batchId: 1,
      itemId: 'item-1',
      payload: { account_label_masked: '账号 1', status: 'completed' },
    })
    outbox.queueBatch({ batchId: 1, payload: { completed_count: 1 } })

    expect(await outbox.flushWithin(100)).toBe(true)
    expect(calls).toEqual(['item', 'batch', 'finish'])
    expect(states).toContain('syncing')
    expect(states.at(-1)).toBe('synced')
  })

  it('retains failed updates and retries them after reconnect', async () => {
    const states: WorkspaceSyncState[] = []
    const updateItem = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const outbox = new BusinessWorkspaceOutbox({
      updateItem,
      updateBatch: vi.fn(),
      finishBatch: vi.fn(),
      onState: state => states.push(state),
      retryDelays: [60_000],
    })

    outbox.queueItem({
      batchId: 1,
      itemId: 'item-1',
      payload: { account_label_masked: '账号 1', status: 'failed' },
    })
    await vi.waitFor(() => expect(states.at(-1)).toBe('offline'))
    expect(outbox.hasPending()).toBe(true)

    outbox.reconnect()
    await vi.waitFor(() => expect(updateItem).toHaveBeenCalledTimes(2))
    expect(await outbox.flushWithin(100)).toBe(true)
    expect(states.at(-1)).toBe('synced')
    outbox.dispose()
  })

  it('keeps different batches and repeated client item IDs in separate queues', async () => {
    const updateItem = vi.fn().mockResolvedValue(undefined)
    const updateBatch = vi.fn().mockResolvedValue(undefined)
    const finishBatch = vi.fn().mockResolvedValue(undefined)
    const outbox = new BusinessWorkspaceOutbox({ updateItem, updateBatch, finishBatch, onState: vi.fn() })
    for (const batchId of [1, 2]) {
      outbox.queueItem({ batchId, itemId: 'row-1', payload: { account_label_masked: '客户', status: 'completed' } })
      outbox.queueBatch({ batchId, payload: { completed_count: 1 } })
      outbox.queueFinish({ batchId, status: 'completed' })
    }
    expect(await outbox.flushWithin(100)).toBe(true)
    expect(updateItem.mock.calls.map(call => call[0])).toEqual([1, 2])
    expect(updateBatch.mock.calls.map(call => call[0])).toEqual([1, 2])
    expect(finishBatch.mock.calls.map(call => call[0])).toEqual([1, 2])
  })

  it('waits for a newer item version that arrives while the old version is in flight', async () => {
    let resolveFirst!: () => void
    const first = new Promise<void>(resolve => { resolveFirst = resolve })
    const calls: string[] = []
    const updateItem = vi.fn().mockImplementationOnce(async () => { calls.push('running'); await first })
      .mockImplementation(async () => { calls.push('completed') })
    const outbox = new BusinessWorkspaceOutbox({
      updateItem, updateBatch: vi.fn(), finishBatch: async () => { calls.push('finish') }, onState: vi.fn(),
    })
    outbox.queueItem({ batchId: 1, itemId: 'row', payload: { account_label_masked: '客户', status: 'running' } })
    await Promise.resolve()
    outbox.queueFinish({ batchId: 1, status: 'completed' })
    outbox.queueItem({ batchId: 1, itemId: 'row', payload: { account_label_masked: '客户', status: 'completed' } })
    resolveFirst()
    expect(await outbox.flushWithin(100)).toBe(true)
    expect(calls).toEqual(['running', 'completed', 'finish'])
  })

  it('does not finish ahead of items enqueued while the summary request is in flight', async () => {
    let resolveSummary!: () => void
    const summary = new Promise<void>(resolve => { resolveSummary = resolve })
    const calls: string[] = []
    const outbox = new BusinessWorkspaceOutbox({
      updateItem: async () => { calls.push('item') }, updateBatch: async () => { await summary },
      finishBatch: async () => { calls.push('finish') }, onState: vi.fn(),
    })
    outbox.queueBatch({ batchId: 1, payload: { completed_count: 1 } })
    await Promise.resolve()
    outbox.queueFinish({ batchId: 1, status: 'completed' })
    outbox.queueItem({ batchId: 1, itemId: 'row', payload: { account_label_masked: '客户', status: 'completed' } })
    resolveSummary()
    expect(await outbox.flushWithin(100)).toBe(true)
    expect(calls).toEqual(['item', 'finish'])
  })

  it('cleans flush deadline timers both after success and after disposal', async () => {
    vi.useFakeTimers()
    const outbox = new BusinessWorkspaceOutbox({
      updateItem: vi.fn().mockResolvedValue(undefined), updateBatch: vi.fn(), finishBatch: vi.fn(), onState: vi.fn(),
    })
    expect(await outbox.flushWithin(10_000)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    outbox.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('disposal stops a late rejected request from creating retries or state callbacks; explicit resume still works', async () => {
    vi.useFakeTimers()
    let rejectRequest!: (error: Error) => void
    const request = new Promise<void>((_, reject) => { rejectRequest = reject })
    const updateItem = vi.fn().mockReturnValueOnce(request).mockResolvedValue(undefined)
    const onState = vi.fn()
    const outbox = new BusinessWorkspaceOutbox({ updateItem, updateBatch: vi.fn(), finishBatch: vi.fn(), onState })
    outbox.queueItem({ batchId: 1, itemId: 'row', payload: { account_label_masked: '客户', status: 'completed' } })
    const bounded = outbox.flushWithin(10_000)
    await Promise.resolve()
    outbox.dispose()
    expect(await bounded).toBe(false)
    onState.mockClear()
    rejectRequest(new Error('late offline'))
    await vi.advanceTimersByTimeAsync(60_000)
    outbox.reconnect()
    expect(updateItem).toHaveBeenCalledTimes(1)
    expect(onState).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    outbox.resume()
    expect(await outbox.flushWithin(100)).toBe(true)
    expect(updateItem).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sealed batches ignore late updates but a new batch remains writable', async () => {
    const updateItem = vi.fn().mockResolvedValue(undefined)
    const updateBatch = vi.fn().mockResolvedValue(undefined)
    const finishBatch = vi.fn().mockResolvedValue(undefined)
    const outbox = new BusinessWorkspaceOutbox({ updateItem, updateBatch, finishBatch, onState: vi.fn() })
    outbox.queueFinish({ batchId: 1, status: 'cancelled' })
    expect(await outbox.flushWithin(100)).toBe(true)
    outbox.queueItem({ batchId: 1, itemId: 'row', payload: { account_label_masked: '客户', status: 'running' } })
    outbox.queueBatch({ batchId: 1, payload: { status: 'running' } })
    outbox.queueFinish({ batchId: 1, status: 'completed' })
    outbox.queueItem({ batchId: 2, itemId: 'row', payload: { account_label_masked: '客户', status: 'running' } })
    expect(await outbox.flushWithin(100)).toBe(true)
    expect(updateItem).toHaveBeenCalledTimes(1)
    expect(updateItem).toHaveBeenCalledWith(2, 'row', expect.any(Object))
    expect(updateBatch).not.toHaveBeenCalled()
    expect(finishBatch).toHaveBeenCalledTimes(1)
  })

  it('seals the terminal snapshot as soon as finish is in flight', async () => {
    let resolveFinish!: () => void
    const finishing = new Promise<void>(resolve => { resolveFinish = resolve })
    const updateItem = vi.fn().mockResolvedValue(undefined)
    const updateBatch = vi.fn().mockResolvedValue(undefined)
    const outbox = new BusinessWorkspaceOutbox({
      updateItem, updateBatch, finishBatch: () => finishing, onState: vi.fn(),
    })
    outbox.queueFinish({ batchId: 1, status: 'completed' })
    const flushed = outbox.flushWithin(100)
    await Promise.resolve()
    outbox.queueItem({ batchId: 1, itemId: 'row', payload: { account_label_masked: '客户', status: 'running' } })
    outbox.queueBatch({ batchId: 1, payload: { status: 'running' } })
    resolveFinish()
    expect(await flushed).toBe(true)
    expect(updateItem).not.toHaveBeenCalled()
    expect(updateBatch).not.toHaveBeenCalled()
  })

  it('a timed-out flush leaves no deadline timer and can converge after the request returns', async () => {
    vi.useFakeTimers()
    let resolveRequest!: () => void
    const request = new Promise<void>(resolve => { resolveRequest = resolve })
    const outbox = new BusinessWorkspaceOutbox({
      updateItem: () => request, updateBatch: vi.fn(), finishBatch: vi.fn(), onState: vi.fn(),
    })
    outbox.queueItem({ batchId: 1, itemId: 'row', payload: { account_label_masked: '客户', status: 'completed' } })
    const bounded = outbox.flushWithin(25)
    await vi.advanceTimersByTimeAsync(25)
    expect(await bounded).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    resolveRequest()
    expect(await outbox.flushWithin(100)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('can explicitly resume while an old lifecycle request is still returning', async () => {
    let resolveRequest!: () => void
    const request = new Promise<void>(resolve => { resolveRequest = resolve })
    const updateItem = vi.fn().mockReturnValueOnce(request).mockResolvedValue(undefined)
    const outbox = new BusinessWorkspaceOutbox({ updateItem, updateBatch: vi.fn(), finishBatch: vi.fn(), onState: vi.fn() })
    outbox.queueItem({ batchId: 1, itemId: 'row', payload: { account_label_masked: '客户', status: 'completed' } })
    await Promise.resolve()
    outbox.dispose()
    outbox.resume()
    resolveRequest()
    await vi.waitFor(() => expect(outbox.hasPending()).toBe(false))
    expect(updateItem).toHaveBeenCalledTimes(2)
  })

  it('does not start the next queued request or acknowledge an old result after owner changes', async () => {
    let ownsSession = true
    let resolveOld!: () => void
    const updateItem = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { resolveOld = resolve }))
      .mockResolvedValue(undefined)
    const onState = vi.fn()
    const outbox = new BusinessWorkspaceOutbox({ updateItem, updateBatch: vi.fn(), finishBatch: vi.fn(),
      onState, maySync: () => ownsSession })
    for (const itemId of ['one', 'two']) outbox.queueItem({ batchId: 1, itemId, payload: { account_label_masked: '客户', status: 'completed' } })
    await Promise.resolve()
    ownsSession = false
    onState.mockClear()
    resolveOld()
    await outbox.flush()
    expect(updateItem).toHaveBeenCalledTimes(1)
    expect(onState).not.toHaveBeenCalled()
    expect(outbox.hasPending()).toBe(true)
    ownsSession = true
    outbox.resume()
    expect(await outbox.flushWithin(100)).toBe(true)
    expect(updateItem.mock.calls.map(call => call[1])).toEqual(['one', 'one', 'two'])
    outbox.dispose()
  })
})
