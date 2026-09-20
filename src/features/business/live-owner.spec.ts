import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessLiveCoordinator } from './live-coordinator'
import { businessToolSchema, emptyBatchSnapshot, importPreviewSchema, type BusinessBatchSnapshot } from './model'

const api = vi.hoisted(() => ({ createBusinessBatch: vi.fn(), createToolLaunchGrant: vi.fn(), getBusinessBatch: vi.fn(),
  finishBusinessBatch: vi.fn(), updateBusinessBatch: vi.fn(), updateBusinessBatchItem: vi.fn() }))
vi.mock('@/utils/api', () => api)
const scene = (id: number): BusinessBatchSnapshot => ({ batchId: `client-${id}`, serverBatchId: id, recordKind: 'live',
  status: 'running', counts: { total: 1, running: 1 }, items: [{ itemId: 'row', status: 'running', browserReady: true, accountLabelMasked: `客***${id}` }] })

describe('Live workspace authorization ownership', () => {
  let owner: string
  let snapshot: BusinessBatchSnapshot
  let hostSnapshot: BusinessBatchSnapshot
  let emit: (event: unknown) => void
  let coordinator: BusinessLiveCoordinator
  const onState = vi.fn()
  const setError = vi.fn()
  const cancelHost = vi.fn()
  beforeEach(async () => {
    vi.useFakeTimers()
    Object.values(api).forEach(mock => mock.mockReset().mockResolvedValue({}))
    onState.mockReset(); setError.mockReset(); cancelHost.mockReset()
    owner = 'api-a:user-a:auth-a:device-a'
    snapshot = emptyBatchSnapshot()
    hostSnapshot = scene(1)
    api.getBusinessBatch.mockImplementation(async (id: number) => ({ id, client_batch_id: `client-${id}` }))
    api.createBusinessBatch.mockResolvedValue({ id: 2 })
    cancelHost.mockImplementation(async () => ({ ...hostSnapshot, status: 'interrupted' }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { batch: {
      onEvent: vi.fn(callback => { emit = callback; return vi.fn() }), getSnapshot: vi.fn(async () => hostSnapshot),
      cancel: cancelHost, create: vi.fn(async () => { hostSnapshot = scene(2); return hostSnapshot }),
    } } })
    coordinator = new BusinessLiveCoordinator({ getOwnerScope: () => owner, getSnapshot: () => snapshot,
      setSnapshot: value => { snapshot = value }, getSelectedTool: () => null, selectItem: vi.fn(), setSyncState: onState, setError })
    await coordinator.initialize()
  })
  afterEach(() => { coordinator.dispose(); vi.useRealTimers() })
  const update = (id: number) => emit({ type: 'batch.item_updated', itemId: 'row', snapshot: scene(id) })
  const start = (id: number) => coordinator.start(businessToolSchema.parse({ id: 'tool', name: '工具', availability: 'live' }),
    importPreviewSchema.parse({ importId: `import-${id}`, validCount: 1 }), `client-${id}`, 1)

  it('keeps an old in-flight queue under its owner and does not starve the new authorization', async () => {
    let rejectOld!: (error: Error) => void
    const requests: Array<{ owner: string; batch: number }> = []
    api.updateBusinessBatchItem.mockImplementation(async (batch: number) => {
      requests.push({ owner, batch })
      if (requests.length === 1) await new Promise((_, reject) => { rejectOld = reject })
    })
    update(1)
    await Promise.resolve()
    coordinator.dispose()
    owner = 'api-a:user-b:auth-b:device-b'
    await coordinator.initialize()
    expect(snapshot.items).toEqual([])
    expect(cancelHost).toHaveBeenCalledOnce()
    await coordinator.start(businessToolSchema.parse({ id: 'tool', name: '工具', availability: 'live' }),
      importPreviewSchema.parse({ importId: 'test', validCount: 1 }), 'client-2', 1)
    update(2)
    expect(await coordinator.flushWithin(100)).toBe(true)
    onState.mockClear()
    rejectOld(new Error('old authorization lost its connection'))
    await vi.advanceTimersByTimeAsync(1)
    expect(onState).not.toHaveBeenCalled()
    expect(requests).toEqual([{ owner: 'api-a:user-a:auth-a:device-a', batch: 1 }, { owner, batch: 2 }])
    expect(snapshot.serverBatchId).toBe(2)
    coordinator.dispose()
    owner = 'api-a:user-a:auth-a:device-a'
    await coordinator.initialize()
    expect(await coordinator.flushWithin(100)).toBe(true)
    expect(requests.at(-1)).toEqual({ owner, batch: 1 })
  })

  it('resumes a same-owner remount without another ownership request', async () => {
    api.updateBusinessBatchItem.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({})
    update(1)
    expect(await coordinator.flushWithin(100)).toBe(false)
    coordinator.dispose()
    await coordinator.initialize()
    expect(await coordinator.flushWithin(100)).toBe(true)
    expect(api.updateBusinessBatchItem).toHaveBeenCalledTimes(2)
    expect(api.getBusinessBatch).toHaveBeenCalledOnce()
    expect(snapshot.serverBatchId).toBe(1)
  })

  it('ignores a foreign or unknown late event after switching owner', async () => {
    coordinator.dispose()
    owner = 'api-b:user-a:auth-a:device-a'
    hostSnapshot = { status: 'idle', recordKind: 'live', items: [], counts: {} }
    await coordinator.initialize()
    update(1)
    update(999)
    expect(snapshot.items).toEqual([])
    expect(api.updateBusinessBatchItem).not.toHaveBeenCalled()
  })

  it('does not expose an unverified scene from a renderer reload or a late read', async () => {
    coordinator.dispose()
    owner = 'api-a:user-b:auth-b:device-b'
    hostSnapshot = scene(999)
    let resolveRead!: (value: unknown) => void
    api.getBusinessBatch.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve }))
    const mounting = coordinator.initialize()
    await Promise.resolve()
    owner = 'api-a:user-c:auth-c:device-c'
    resolveRead({ id: 999, client_batch_id: 'client-999' })
    await mounting
    expect(snapshot.items).toEqual([])
    expect(api.updateBusinessBatchItem).not.toHaveBeenCalled()
  })

  it('rereads a host that finishes during ownership verification and persists the missed terminal event', async () => {
    coordinator.dispose()
    owner = 'api-a:user-b:auth-b:device-b'
    hostSnapshot = scene(999)
    let resolveRead!: (value: unknown) => void
    api.getBusinessBatch.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve }))
    const mounting = coordinator.initialize()
    await Promise.resolve()
    hostSnapshot = { ...scene(999), status: 'completed', counts: { total: 1, completed: 1 },
      items: [{ ...scene(999).items[0]!, status: 'completed' }] }
    emit({ type: 'batch.finished', snapshot: hostSnapshot })
    expect(snapshot.items).toEqual([])
    resolveRead({ id: 999, client_batch_id: 'client-999' })
    await mounting
    expect(snapshot.status).toBe('completed')
    expect(await coordinator.flushWithin(100)).toBe(true)
    expect(api.updateBusinessBatchItem).toHaveBeenCalledWith(999, 'row', expect.objectContaining({ status: 'completed' }))
    expect(api.finishBusinessBatch).toHaveBeenCalledWith(999, 'completed')
  })

  it('does not create a local batch after cancelling a pending server create', async () => {
    let resolveCreate!: (value: unknown) => void
    api.createBusinessBatch.mockReturnValueOnce(new Promise(resolve => { resolveCreate = resolve }))
    const starting = start(2)
    const rejected = expect(starting).rejects.toThrow('批次启动已取消')
    await coordinator.cancel()
    const cancelled = snapshot
    resolveCreate({ id: 2 })
    await rejected
    expect(window.electronAPI?.batch?.create).not.toHaveBeenCalled()
    expect(snapshot).toEqual(cancelled)
    expect(await coordinator.flushWithin(100)).toBe(true)
    expect(api.finishBusinessBatch).toHaveBeenCalledWith(2, 'cancelled')
  })

  it('does not let an old pending create overwrite a newer start', async () => {
    let resolveCreate!: (value: unknown) => void
    api.createBusinessBatch.mockReturnValueOnce(new Promise(resolve => { resolveCreate = resolve })).mockResolvedValueOnce({ id: 3 })
    vi.mocked(window.electronAPI!.batch!.create).mockImplementationOnce(async () => { hostSnapshot = scene(3); return hostSnapshot })
    const starting = start(2)
    const rejected = expect(starting).rejects.toThrow('批次启动已取消')
    await start(3)
    resolveCreate({ id: 2 })
    await rejected
    update(2)
    expect(snapshot.serverBatchId).toBe(3)
    expect(window.electronAPI?.batch?.create).toHaveBeenCalledOnce()
    expect(await coordinator.flushWithin(100)).toBe(true)
    expect(api.finishBusinessBatch).toHaveBeenCalledWith(2, 'cancelled')
  })

  it('retains a late created batch cancellation only for its original owner', async () => {
    let resolveCreate!: (value: unknown) => void
    api.createBusinessBatch.mockReturnValueOnce(new Promise(resolve => { resolveCreate = resolve }))
    const starting = start(2)
    const rejected = expect(starting).rejects.toThrow('授权已变更')
    coordinator.dispose()
    owner = 'api-a:user-b:auth-b:device-b'
    hostSnapshot = emptyBatchSnapshot()
    await coordinator.initialize()
    resolveCreate({ id: 2 })
    await rejected
    expect(api.finishBusinessBatch).not.toHaveBeenCalled()
    expect(snapshot.items).toEqual([])
    coordinator.dispose()
    owner = 'api-a:user-a:auth-a:device-a'
    await coordinator.initialize()
    expect(await coordinator.flushWithin(100)).toBe(true)
    expect(api.finishBusinessBatch).toHaveBeenCalledWith(2, 'cancelled')
  })

  it('ignores a delayed local create response and its events after cancellation', async () => {
    let resolveCreate!: (value: BusinessBatchSnapshot) => void
    vi.mocked(window.electronAPI!.batch!.create).mockImplementationOnce(async () => {
      hostSnapshot = scene(2)
      return await new Promise(resolve => { resolveCreate = resolve })
    })
    const starting = start(2)
    const rejected = expect(starting).rejects.toThrow('批次启动已取消')
    await Promise.resolve()
    await coordinator.cancel()
    const cancelled = snapshot
    resolveCreate(scene(2))
    await rejected
    update(2)
    expect(snapshot).toEqual(cancelled)
    expect(await coordinator.flushWithin(100)).toBe(true)
    expect(api.finishBusinessBatch).toHaveBeenCalledWith(2, 'cancelled')
  })
})
