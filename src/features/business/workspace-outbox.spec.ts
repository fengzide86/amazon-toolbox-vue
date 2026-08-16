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
})
