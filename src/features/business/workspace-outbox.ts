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
}

export class BusinessWorkspaceOutbox {
  private readonly itemOutbox = new Map<string, PendingItemSync>()
  private batchOutbox: PendingBatchSync | null = null
  private finishOutbox: PendingFinishSync | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryIndex = 0
  private flushing: Promise<void> | null = null
  private readonly retryDelays: readonly number[]

  constructor(private readonly options: WorkspaceOutboxOptions) {
    this.retryDelays = options.retryDelays || [2_000, 5_000, 15_000, 30_000]
  }

  queueItem(pending: PendingItemSync): void {
    this.itemOutbox.set(pending.itemId, pending)
    void this.flush()
  }

  queueBatch(pending: PendingBatchSync): void {
    this.batchOutbox = pending
    void this.flush()
  }

  queueFinish(pending: PendingFinishSync): void {
    this.finishOutbox = pending
  }

  hasPending(): boolean {
    return this.itemOutbox.size > 0 || this.batchOutbox !== null || this.finishOutbox !== null
  }

  reconnect(): void {
    this.clearRetry()
    if (this.hasPending()) void this.flush()
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing
    if (!this.hasPending()) {
      this.options.onState('synced')
      return
    }
    this.clearRetry()
    this.options.onState('syncing')
    let completedWithoutError = false
    this.flushing = (async () => {
      try {
        for (const [key, pending] of [...this.itemOutbox.entries()]) {
          await this.options.updateItem(pending.batchId, pending.itemId, pending.payload)
          if (this.itemOutbox.get(key) === pending) this.itemOutbox.delete(key)
        }
        const pendingBatch = this.batchOutbox
        if (pendingBatch) {
          await this.options.updateBatch(pendingBatch.batchId, pendingBatch.payload)
          if (this.batchOutbox === pendingBatch) this.batchOutbox = null
        }
        const pendingFinish = this.finishOutbox
        if (pendingFinish) {
          await this.options.finishBatch(pendingFinish.batchId, pendingFinish.status)
          if (this.finishOutbox === pendingFinish) this.finishOutbox = null
        }
        this.retryIndex = 0
        this.options.onState(this.hasPending() ? 'syncing' : 'synced')
        completedWithoutError = true
      } catch {
        this.options.onState('offline')
        this.scheduleRetry()
      } finally {
        this.flushing = null
        if (completedWithoutError && this.hasPending()) void this.flush()
      }
    })()
    return this.flushing
  }

  async flushWithin(timeoutMs: number): Promise<boolean> {
    await Promise.race([this.flush(), new Promise<void>(resolve => setTimeout(resolve, timeoutMs))])
    return !this.hasPending()
  }

  dispose(): void {
    this.clearRetry()
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private scheduleRetry(): void {
    if (this.retryTimer || !this.hasPending()) return
    const fallbackDelay = this.retryDelays.at(-1) || 30_000
    const delay = this.retryDelays[Math.min(this.retryIndex, this.retryDelays.length - 1)] || fallbackDelay
    this.retryIndex += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.flush()
    }, delay)
  }
}
