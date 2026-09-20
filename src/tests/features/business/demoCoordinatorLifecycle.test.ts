import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessDemoCoordinator } from '@/features/business/demo-coordinator'
import { DemoBatchRecovery } from '@/features/business/demo-recovery'
import { businessToolSchema, emptyBatchSnapshot, importPreviewSchema } from '@/features/business/model'

const api = vi.hoisted(() => ({ createDemoBatch: vi.fn(), updateDemoBatch: vi.fn(), updateDemoBatchItem: vi.fn(), finishDemoBatch: vi.fn() }))
vi.mock('@/utils/api', () => api)
const tool = businessToolSchema.parse({ id: 'demo', name: 'Fixture Demo', script_key: 'demo.fixture' })
const preview = importPreviewSchema.parse({ importId: 'fixture', validCount: 1, rows: [{ itemId: 'input', preview: {} }] })
const serverBatch = (id: string) => ({ id, tool_id: 'demo', row_count: 1, items: [{ item_ref: `${id}-item`, status: 'queued', event_seq: 0 }] })
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('Demo startup lifecycle ownership', () => {
  const coordinators: BusinessDemoCoordinator[] = []
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    Object.values(api).forEach(mock => mock.mockReset())
    api.createDemoBatch.mockImplementation(async ({ client_demo_batch_id }: { client_demo_batch_id: string }) => serverBatch(client_demo_batch_id))
    api.updateDemoBatch.mockImplementation(async (id: string, payload: object) => ({ id, ...payload }))
    api.updateDemoBatchItem.mockResolvedValue({})
    api.finishDemoBatch.mockResolvedValue({})
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { demoActivity: { setActive: vi.fn().mockResolvedValue(undefined) } } })
  })
  afterEach(() => { coordinators.forEach(item => item.dispose()); coordinators.length = 0; vi.useRealTimers() })

  function setup() {
    let snapshot = emptyBatchSnapshot()
    let scope = 'owner-1'
    const error = vi.fn()
    const recovery = new DemoBatchRecovery({ scope: () => scope, storage: () => localStorage,
      getBatch: vi.fn(), updateBatch: api.updateDemoBatch, onChange: vi.fn(), onRecovered: vi.fn() })
    const coordinator = new BusinessDemoCoordinator({ recovery, getSnapshot: () => snapshot,
      setSnapshot: value => { snapshot = value }, setSyncState: vi.fn(), setError: error,
      refreshHistory: vi.fn().mockResolvedValue(undefined) })
    coordinators.push(coordinator)
    return { coordinator, error, getSnapshot: () => snapshot, changeScope: (next: string) => { scope = next } }
  }

  it('does not resurrect a disposed startup after create returns', async () => {
    const pending = deferred()
    api.createDemoBatch.mockReturnValueOnce(pending.promise)
    const { coordinator, getSnapshot } = setup()
    const result = coordinator.start(tool, preview, 'old').catch(error => error)
    coordinator.dispose()
    pending.resolve(serverBatch('old-server'))
    expect(await result).toBeInstanceOf(Error)
    expect(getSnapshot().status).toBe('idle')
    expect(api.updateDemoBatchItem).not.toHaveBeenCalled()
    expect(api.updateDemoBatch).toHaveBeenCalledWith('old-server', { event_seq: 2, status: 'cancelled' })
    expect(window.electronAPI?.demoActivity?.setActive).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)('does not let old playing %s stop or overwrite a newer run', async settle => {
    const pending = deferred()
    api.updateDemoBatchItem.mockReturnValueOnce(pending.promise)
    const { coordinator, getSnapshot, error } = setup()
    const old = coordinator.start(tool, preview, 'old').catch(cause => cause)
    await vi.waitFor(() => expect(api.updateDemoBatchItem).toHaveBeenCalledOnce())
    await coordinator.start(tool, preview, 'new')
    error.mockClear()
    pending[settle](settle === 'reject' ? new Error('old request failed') : {})
    expect(await old).toBeInstanceOf(Error)
    expect(getSnapshot().serverBatchId).toBe('demo_new')
    expect(getSnapshot().status).toBe('running')
    expect(error).not.toHaveBeenCalled()
    expect(window.electronAPI?.demoActivity?.setActive).not.toHaveBeenCalledWith('batch:demo_new', false)
    expect(api.updateDemoBatch).toHaveBeenCalledWith('demo_old', { event_seq: 2, status: 'cancelled' })
  })

  it('retains old-scope terminal intent without sending it using a new authorization', async () => {
    const pending = deferred()
    api.createDemoBatch.mockReturnValueOnce(pending.promise)
    const { coordinator, changeScope, getSnapshot } = setup()
    const old = coordinator.start(tool, preview, 'old').catch(error => error)
    changeScope('owner-2')
    coordinator.dispose()
    pending.resolve(serverBatch('old-server'))
    expect(await old).toBeInstanceOf(Error)
    expect(api.updateDemoBatch).not.toHaveBeenCalled()
    expect(getSnapshot().status).toBe('idle')
    expect(localStorage.key(0)).toContain('owner-1')
    expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!).status).toBe('cancelled')
  })

  it('clears only its own activity token after a delayed activation arrives', async () => {
    const pending = deferred()
    const activity = vi.mocked(window.electronAPI!.demoActivity!.setActive)
    activity.mockImplementationOnce(() => pending.promise as Promise<void>)
    const { coordinator, getSnapshot } = setup()
    const old = coordinator.start(tool, preview, 'old').catch(error => error)
    await vi.waitFor(() => expect(activity).toHaveBeenCalledWith('batch:demo_old', true))
    await coordinator.cancel()
    await coordinator.start(tool, preview, 'new')
    pending.resolve(undefined)
    expect(await old).toBeInstanceOf(Error)
    expect(getSnapshot().serverBatchId).toBe('demo_new')
    expect(getSnapshot().status).toBe('running')
    expect(activity).toHaveBeenLastCalledWith('batch:demo_old', false)
    expect(activity).not.toHaveBeenCalledWith('batch:demo_new', false)
  })
})
