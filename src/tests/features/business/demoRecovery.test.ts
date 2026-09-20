import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoBatchRecovery } from '@/features/business/demo-recovery'

describe('durable demo terminal reconciliation', () => {
  const instances: DemoBatchRecovery[] = []
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear() })
  afterEach(() => { instances.forEach(instance => instance.dispose()); instances.length = 0; vi.useRealTimers() })

  function setup(overrides: Partial<ConstructorParameters<typeof DemoBatchRecovery>[0]> = {}) {
    const options = {
      scope: () => 'control-api:user-1:authorization-1',
      storage: () => localStorage,
      getBatch: vi.fn().mockImplementation(async (id: string) => ({ id, status: 'running', event_seq: 15 })),
      updateBatch: vi.fn().mockImplementation(async (id: string, payload: { status: string; event_seq: number }) => ({ id, ...payload })),
      onChange: vi.fn(), onRecovered: vi.fn(), retryMs: 1000,
      ...overrides,
    }
    const recovery = new DemoBatchRecovery(options)
    instances.push(recovery)
    return { recovery, options }
  }

  it('survives reload, reconciles server sequence and never stores input rows or credentials', async () => {
    const first = setup()
    expect(first.recovery.remember(42, 'cancelled', 3)?.durable).toBe(true)
    const value = localStorage.getItem(localStorage.key(0)!)!
    expect(Object.keys(JSON.parse(value)).sort()).toEqual(['batchId', 'eventSeq', 'revision', 'status', 'version'])
    first.recovery.dispose()
    const next = setup()
    next.recovery.initialize()
    await next.recovery.flush()
    expect(next.options.updateBatch).toHaveBeenCalledWith('42', { status: 'cancelled', event_seq: 16 })
    expect(localStorage.length).toBe(0)
    expect(next.options.onRecovered).toHaveBeenCalledWith('42')
  })

  it.each(['completed', 'cancelled', 'error'])('does not rewrite already %s results after a lost response', async status => {
    const { recovery, options } = setup({ getBatch: vi.fn().mockResolvedValue({ id: '42', status, event_seq: 90 }) })
    recovery.remember(42, 'cancelled', 3)
    recovery.initialize()
    await recovery.flush()
    expect(options.updateBatch).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })

  it('keeps offline intent and retries on connectivity without starving other batches', async () => {
    const { recovery, options } = setup()
    vi.mocked(options.getBatch).mockRejectedValueOnce(new TypeError('offline'))
    recovery.remember(1, 'cancelled', 1)
    recovery.remember(2, 'error', 1)
    recovery.initialize()
    await recovery.flush()
    expect(localStorage.length).toBe(1)
    expect(options.onRecovered).toHaveBeenCalledWith('2')
    window.dispatchEvent(new Event('online'))
    await recovery.flush()
    expect(localStorage.length).toBe(0)
  })

  it('isolates authorization owners and stops replay when the user changes during a read', async () => {
    let scope = 'owner-a'
    let resolveRead!: (value: unknown) => void
    const { recovery, options } = setup({ scope: () => scope, getBatch: vi.fn(() => new Promise(resolve => { resolveRead = resolve })) })
    recovery.remember(1, 'cancelled', 1)
    scope = 'owner-b'
    recovery.initialize()
    await recovery.flush()
    expect(options.getBatch).not.toHaveBeenCalled()
    scope = 'owner-a'
    const pending = recovery.flush()
    scope = 'owner-b'
    resolveRead({ id: 1, status: 'running', event_seq: 1 })
    await pending
    expect(options.updateBatch).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(1)
  })

  it('does not erase a superseding intent when acknowledging an earlier request', () => {
    const { recovery } = setup()
    const old = recovery.remember(1, 'error', 1)
    recovery.remember(1, 'cancelled', 2)
    recovery.confirm(old)
    expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!).status).toBe('cancelled')
  })

  it('keeps a volatile fallback and reports when storage is unavailable', async () => {
    const { recovery, options } = setup({ storage: () => { throw new Error('quota') } })
    expect(recovery.remember(1, 'cancelled', 1)?.durable).toBe(false)
    expect(options.onChange).toHaveBeenLastCalledWith(1, true)
    recovery.initialize()
    await recovery.flush()
    expect(options.updateBatch).toHaveBeenCalledOnce()
  })

  it('does not replay malformed storage or mismatched server batch identity', async () => {
    const { recovery, options } = setup({ getBatch: vi.fn().mockResolvedValue({ id: 2, status: 'running', event_seq: 1 }) })
    recovery.remember(1, 'cancelled', 1)
    localStorage.setItem(localStorage.key(0)! + 'corrupt', '{bad-json')
    recovery.initialize()
    await recovery.flush()
    expect(options.updateBatch).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(2)
    expect(options.onChange).toHaveBeenLastCalledWith(1, true)
  })

  it('does not schedule retries or mutate the server after disposal', async () => {
    let resolveRead!: (value: unknown) => void
    const { recovery, options } = setup({ getBatch: vi.fn(() => new Promise(resolve => { resolveRead = resolve })) })
    recovery.remember(1, 'cancelled', 1)
    recovery.initialize()
    const pending = recovery.flush()
    recovery.dispose()
    resolveRead({ id: 1, status: 'running', event_seq: 1 })
    await pending
    await vi.advanceTimersByTimeAsync(5000)
    expect(options.getBatch).toHaveBeenCalledOnce()
    expect(options.updateBatch).not.toHaveBeenCalled()
  })

  it('resumes the new mounted generation after an old in-flight read settles', async () => {
    let resolveOld!: (value: unknown) => void
    const getBatch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValue({ id: '1', status: 'running', event_seq: 5 })
    const { recovery, options } = setup({ getBatch })
    recovery.remember(1, 'cancelled', 1)
    recovery.initialize()
    const old = recovery.flush()
    recovery.dispose()
    recovery.initialize()
    resolveOld({ id: '1', status: 'running', event_seq: 2 })
    await old
    await recovery.flush()
    expect(getBatch).toHaveBeenCalledTimes(2)
    expect(options.updateBatch).toHaveBeenCalledOnce()
    expect(options.updateBatch).toHaveBeenCalledWith('1', { status: 'cancelled', event_seq: 6 })
    expect(localStorage.length).toBe(0)
  })

  it('retains intent when duplicate-sequence HTTP 200 still reports running', async () => {
    const updateBatch = vi.fn().mockResolvedValueOnce({ id: '1', status: 'running', event_seq: 16 })
      .mockResolvedValue({ id: '1', status: 'cancelled', event_seq: 17 })
    const { recovery, options } = setup({ updateBatch })
    recovery.remember(1, 'cancelled', 3)
    recovery.initialize()
    await recovery.flush()
    expect(localStorage.length).toBe(1)
    expect(options.onRecovered).not.toHaveBeenCalled()
    vi.mocked(options.getBatch).mockResolvedValue({ id: '1', status: 'running', event_seq: 16 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(updateBatch).toHaveBeenLastCalledWith('1', { status: 'cancelled', event_seq: 17 })
    expect(localStorage.length).toBe(0)
  })

  it('rejects malformed or wrong-batch terminal acknowledgements', () => {
    const { recovery } = setup()
    const receipt = recovery.remember(1, 'cancelled', 3)
    expect(recovery.confirmTerminal(receipt, {})).toBe(false)
    expect(recovery.confirmTerminal(receipt, { id: '2', status: 'cancelled', event_seq: 3 })).toBe(false)
    expect(localStorage.length).toBe(1)
    expect(recovery.confirmTerminal(receipt, { data: { id: '1', status: 'cancelled', event_seq: 3 } })).toBe(true)
    expect(localStorage.length).toBe(0)
  })
})
