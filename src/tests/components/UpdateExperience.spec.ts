import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useUpdateStore } from '@/features/updates/store'
import type { UpdateSnapshot } from '@/shared/ipc/update-contract'

const available: UpdateSnapshot = {
  supported: true,
  status: 'available',
  currentVersion: '1.7.2',
  availableVersion: '1.7.3',
  releaseNotes: ['提升更新体验'],
  downloadBytes: 168_000_000,
  canRestart: false,
}

describe('non-blocking update experience', () => {
  let listener: ((state: UpdateSnapshot) => void) | undefined
  const removeListener = vi.fn()
  const bridge = {
    getState: vi.fn(async () => ({ ...available })),
    check: vi.fn(async () => ({ ...available })),
    startDownload: vi.fn(async () => ({ ...available, status: 'downloading' as const, percent: 0 })),
    cancelDownload: vi.fn(async () => ({ ...available, status: 'cancelled' as const })),
    install: vi.fn(async () => ({ ...available, status: 'installing' as const })),
    defer: vi.fn(async () => ({ ...available })),
    onState: vi.fn((callback: (state: UpdateSnapshot) => void) => { listener = callback; return removeListener }),
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    window.electronAPI = { updates: bridge }
  })

  afterEach(() => { delete window.electronAPI })

  it('initializes without downloading or opening a blocking drawer', async () => {
    const store = useUpdateStore()
    await store.initialize()
    expect(store.state.status).toBe('available')
    expect(store.shouldShowNotice).toBe(true)
    expect(store.drawerOpen).toBe(false)
    expect(bridge.startDownload).not.toHaveBeenCalled()
  })

  it('suppresses the flow notice for 24 hours but keeps the update available', async () => {
    const store = useUpdateStore()
    await store.initialize()
    await store.deferDownload()
    expect(store.state.status).toBe('available')
    expect(store.shouldShowNotice).toBe(false)
    expect(bridge.defer).toHaveBeenCalledWith({ phase: 'download' })
  })

  it('uses real progress snapshots from the main process', async () => {
    const store = useUpdateStore()
    await store.initialize()
    listener?.({ ...available, status: 'downloading', percent: 42.4, transferredBytes: 20, totalBytes: 100 })
    expect(store.displayPercent).toBe(42)
    expect(store.state.totalBytes).toBe(100)
  })

  it('retries a cancelled download without forcing another update check', async () => {
    const store = useUpdateStore()
    await store.initialize()
    listener?.({ ...available, status: 'cancelled' })

    await store.startDownload()

    expect(bridge.startDownload).toHaveBeenCalledOnce()
    expect(bridge.check).not.toHaveBeenCalled()
    expect(store.state.status).toBe('downloading')
  })

  it('cleans the IPC subscription when disposed', async () => {
    const store = useUpdateStore()
    await store.initialize()
    store.dispose()
    expect(removeListener).toHaveBeenCalledOnce()
  })

  it('hides the update entry when the desktop runtime reports preview mode', async () => {
    bridge.getState.mockResolvedValueOnce({
      supported: false,
      status: 'idle',
      currentVersion: '1.7.6',
      releaseNotes: [],
      canRestart: false,
    })
    const store = useUpdateStore()

    await store.initialize()

    expect(store.supported).toBe(false)
    expect(store.showHeaderEntry).toBe(false)
    expect(bridge.check).not.toHaveBeenCalled()
  })
})
