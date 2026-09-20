import type { components } from '@/shared/api/openapi.generated'

export type WorkspaceSyncState = 'synced' | 'syncing' | 'offline'

type Schemas = components['schemas']
type BatchFinishStatus = Schemas['BatchFinish']['status']

interface PendingItemSync {
  batchId: string | number
  itemId: string
  payload: Schemas['BatchItemUpdate']
}

interface PendingBatchSync {
  batchId: string | number
  payload: Schemas['BatchUpdate']
}

interface PendingFinishSync {
  batchId: string | number
  status: BatchFinishStatus
}

interface WorkspaceOutboxOptions {
  updateItem: (batchId: string | number, itemId: string, payload: Schemas['BatchItemUpdate']) => Promise<unknown>
  updateBatch: (batchId: string | number, payload: Schemas['BatchUpdate']) => Promise<unknown>
  finishBatch: (batchId: string | number, status: BatchFinishStatus) => Promise<unknown>
  onState: (state: WorkspaceSyncState) => void
  retryDelays?: readonly number[]
  maySync?: () => boolean
}

export class BusinessWorkspaceOutbox {
  private readonly itemOutbox = new Map<string, PendingItemSync>()
  private readonly batchOutbox = new Map<string, PendingBatchSync>()
  private readonly finishOutbox = new Map<string, PendingFinishSync>()
  private readonly finishingBatches = new Set<string>()
  private readonly finishedBatches = new Set<string>()
  private readonly flushWaiters = new Map<ReturnType<typeof setTimeout>, () => void>()
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryIndex = 0
  private flushing: Promise<void> | null = null
  private disposed = false
  private lifecycle = 0
  private readonly retryDelays: readonly number[]

  constructor(private readonly options: WorkspaceOutboxOptions) {
    this.retryDelays = options.retryDelays || [2_000, 5_000, 15_000, 30_000]
  }

  queueItem(pending: PendingItemSync): void {
    if (!this.canQueue(pending.batchId)) return
    this.itemOutbox.set(JSON.stringify([String(pending.batchId), pending.itemId]), pending)
    void this.flush()
  }

  queueBatch(pending: PendingBatchSync): void {
    if (!this.canQueue(pending.batchId)) return
    this.batchOutbox.set(String(pending.batchId), pending)
    void this.flush()
  }

  queueFinish(pending: PendingFinishSync): void {
    if (!this.canQueue(pending.batchId)) return
    this.finishOutbox.set(String(pending.batchId), pending)
  }

  /** A late create response must stay with its original owner, even while paused. */
  retainCancellation(batchId: string | number): void {
    const key = String(batchId)
    if (this.finishedBatches.has(key) || this.finishingBatches.has(key)) return
    this.finishOutbox.set(key, { batchId, status: 'cancelled' })
    void this.flush()
  }

  hasPending(): boolean {
    return this.itemOutbox.size > 0 || this.batchOutbox.size > 0 || this.finishOutbox.size > 0
  }

  resume(): void {
    this.disposed = false
    this.reconnect()
  }

  reconnect(): void {
    if (!this.maySync()) return
    this.clearRetry()
    if (this.hasPending()) void this.flush()
  }

  async flush(): Promise<void> {
    if (!this.maySync()) return
    if (this.flushing) return this.flushing
    if (!this.hasPending()) {
      this.options.onState('synced')
      return
    }
    this.clearRetry()
    this.options.onState('syncing')
    const lifecycle = this.lifecycle
    const active = () => this.maySync() && this.lifecycle === lifecycle
    let failed = false
    // Defer draining one microtask so a terminal snapshot can enqueue all rows
    // before the first request and so synchronous adapter errors cannot strand
    // this.flushing as an already-completed promise.
    this.flushing = Promise.resolve().then(async () => {
      try {
        while (active() && this.hasPending()) {
          for (const [key, pending] of [...this.itemOutbox.entries()]) {
            if (!active()) return
            await this.options.updateItem(pending.batchId, pending.itemId, pending.payload)
            if (!active()) return
            if (this.itemOutbox.get(key) === pending) this.itemOutbox.delete(key)
          }
          for (const [key, pending] of [...this.batchOutbox.entries()]) {
            if (!active()) return
            await this.options.updateBatch(pending.batchId, pending.payload)
            if (!active()) return
            if (this.batchOutbox.get(key) === pending) this.batchOutbox.delete(key)
          }
          for (const [key, pending] of [...this.finishOutbox.entries()]) {
            if (!active()) return
            // New item versions can arrive while any previous request awaits.
            // A finish is a per-batch barrier, not just the last entry in an
            // earlier copied queue. Never finish ahead of those newer writes.
            if (this.batchOutbox.has(key) || [...this.itemOutbox.values()].some(item => String(item.batchId) === key)) continue
            this.finishingBatches.add(key)
            try {
              await this.options.finishBatch(pending.batchId, pending.status)
              if (!active()) return
              this.finishedBatches.add(key)
              this.finishOutbox.delete(key)
            } finally {
              this.finishingBatches.delete(key)
            }
          }
        }
        if (!active()) return
        this.retryIndex = 0
        this.options.onState('synced')
      } catch {
        if (!active()) return
        failed = true
        this.options.onState('offline')
        this.scheduleRetry()
      } finally {
        this.flushing = null
        // A deliberate resume may occur before an old in-flight request ends.
        // Only that new lifecycle can restart draining after disposal.
        if (this.maySync() && this.hasPending() && (!failed || this.lifecycle !== lifecycle)) void this.flush()
      }
    })
    return this.flushing
  }

  async flushWithin(timeoutMs: number): Promise<boolean> {
    if (!this.maySync()) return !this.hasPending()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs))
      this.flushWaiters.set(timer, resolve)
    })
    try {
      await Promise.race([this.flush(), timeout])
      return !this.hasPending()
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
        this.flushWaiters.delete(timer)
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.lifecycle += 1
    this.clearRetry()
    for (const [timer, resolve] of this.flushWaiters) {
      clearTimeout(timer)
      resolve()
    }
    this.flushWaiters.clear()
  }

  private canQueue(batchId: string | number): boolean {
    const key = String(batchId)
    // Once finish is sent, the snapshot is sealed. The coordinator enqueues
    // its complete final snapshot before this point; later events are stale.
    return this.maySync() && !this.finishedBatches.has(key) && !this.finishingBatches.has(key)
  }

  private maySync(): boolean { return !this.disposed && (this.options.maySync?.() ?? true) }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private scheduleRetry(): void {
    if (!this.maySync() || this.retryTimer || !this.hasPending()) return
    const fallbackDelay = this.retryDelays.at(-1) || 30_000
    const delay = this.retryDelays[Math.min(this.retryIndex, this.retryDelays.length - 1)] || fallbackDelay
    this.retryIndex += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.flush()
    }, delay)
  }
}
