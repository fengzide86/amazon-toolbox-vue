import { z } from 'zod'

const intentSchema = z.object({
  version: z.literal(1),
  batchId: z.string().min(1).max(128),
  status: z.enum(['cancelled', 'error']),
  eventSeq: z.number().int().nonnegative(),
  revision: z.string().min(1).max(80),
}).strict()
type Intent = z.infer<typeof intentSchema>
export interface RecoveryReceipt { key: string; intent: Intent; durable: boolean }

const serverSchema = z.object({
  id: z.union([z.string(), z.number()]),
  status: z.enum(['created', 'running', 'completed', 'cancelled', 'error']),
  event_seq: z.number().int().nonnegative(),
})
const PREFIX = 'toolbox_demo_recovery_v1:'

interface RecoveryOptions {
  scope(): string | null
  storage(): Storage
  getBatch(id: string): Promise<unknown>
  updateBatch(id: string, payload: { status: 'cancelled' | 'error'; event_seq: number }): Promise<unknown>
  onChange(count: number, storageUnavailable: boolean): void
  onRecovered(id: string): void
  retryMs?: number
}

/** Only terminal intent is persisted: never account labels, input rows or credentials.
 * Reconnection reconciles a stopped demo; it never restarts automation or claims success.
 * One key per batch prevents independent tabs/batches overwriting a shared array.
 */
export class DemoBatchRecovery {
  private readonly memory = new Map<string, RecoveryReceipt>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private flushing: Promise<void> | null = null
  private active = false
  private generation = 0
  private storageUnavailable = false

  constructor(private readonly options: RecoveryOptions) {}

  currentScope(): string | null { return this.options.scope() }

  remember(batchId: string | number, status: Intent['status'], eventSeq: number, scope = this.currentScope()): RecoveryReceipt | null {
    if (!scope) return null
    const intent = intentSchema.parse({ version: 1, batchId: String(batchId), status, eventSeq, revision: crypto.randomUUID() })
    const key = `${this.prefix(scope)}${encodeURIComponent(intent.batchId)}`
    const receipt = { key, intent, durable: false }
    try {
      this.options.storage().setItem(key, JSON.stringify(intent))
      receipt.durable = true
    } catch { this.storageUnavailable = true }
    this.memory.set(key, receipt)
    this.notify()
    return receipt
  }

  confirm(receipt: RecoveryReceipt | null): void {
    if (!receipt) return
    if (this.memory.get(receipt.key)?.intent.revision === receipt.intent.revision) this.memory.delete(receipt.key)
    try {
      const raw = this.options.storage().getItem(receipt.key)
      if (raw && intentSchema.parse(JSON.parse(raw)).revision === receipt.intent.revision) {
        this.options.storage().removeItem(receipt.key)
      }
    } catch { this.storageUnavailable = true }
    this.notify()
  }

  confirmTerminal(receipt: RecoveryReceipt | null, response: unknown): boolean {
    if (!receipt) return true
    const body = typeof response === 'object' && response !== null && 'data' in response ? response.data : response
    const parsed = serverSchema.safeParse(body)
    if (!parsed.success || String(parsed.data.id) !== receipt.intent.batchId
      || parsed.data.status === 'created' || parsed.data.status === 'running') return false
    this.confirm(receipt)
    return true
  }

  initialize(): void {
    if (!this.active) {
      this.active = true
      window.addEventListener('online', this.reconnect)
      window.addEventListener('focus', this.reconnect)
    }
    this.notify()
    this.reconnect()
  }

  retry(): void { this.reconnect() }

  dispose(): void {
    this.active = false
    this.generation += 1
    this.clearTimer()
    window.removeEventListener('online', this.reconnect)
    window.removeEventListener('focus', this.reconnect)
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing
    const scope = this.currentScope()
    if (!scope || !this.active) return
    const generation = this.generation
    const valid = () => this.active && generation === this.generation && scope === this.currentScope()
    this.clearTimer()
    const work = async () => {
      for (const receipt of this.entries(scope)) {
        if (!valid()) return
        try {
          const response = await this.options.getBatch(receipt.intent.batchId)
          if (!valid()) return
          const body = typeof response === 'object' && response !== null && 'data' in response ? response.data : response
          const batch = serverSchema.parse(body)
          if (String(batch.id) !== receipt.intent.batchId) throw new Error('演示批次身份不匹配')
          // A lost response may already have committed. Do not rewrite any terminal result.
          if (batch.status === 'created' || batch.status === 'running') {
            const updated = await this.options.updateBatch(receipt.intent.batchId, {
              status: receipt.intent.status,
              event_seq: Math.max(batch.event_seq + 1, receipt.intent.eventSeq),
            })
            if (!valid()) return
            // Duplicate event_seq acknowledgements can return the still-running
            // row. HTTP 200 alone is not proof that terminal intent committed.
            if (!this.confirmTerminal(receipt, updated)) throw new Error('演示批次终态尚未确认')
          } else {
            this.confirm(receipt)
          }
          if (!valid()) return
          this.options.onRecovered(receipt.intent.batchId)
        } catch {
          // Keep failed records independently; another batch must not be starved.
        }
      }
    }
    this.flushing = work()
    try { await this.flushing }
    finally {
      this.flushing = null
      this.notify()
      if (this.active && !valid()) {
        // A remount/authorization change may have tried to reconnect while the
        // previous generation owned this.flushing. Drain that new generation now.
        void this.flush()
      } else if (valid() && this.entries(scope).length) {
        this.timer = setTimeout(this.reconnect, this.options.retryMs ?? 15_000)
      }
    }
  }

  private readonly reconnect = (): void => { void this.flush() }

  private entries(scope: string): RecoveryReceipt[] {
    const prefix = this.prefix(scope)
    const entries = new Map([...this.memory].filter(([key]) => key.startsWith(prefix)))
    try {
      const storage = this.options.storage()
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (!key?.startsWith(prefix)) continue
        const raw = storage.getItem(key)
        if (!raw || raw.length > 1024) { this.storageUnavailable = true; continue }
        try {
          const intent = intentSchema.parse(JSON.parse(raw))
          if (key !== `${prefix}${encodeURIComponent(intent.batchId)}`) throw new Error('批次标识不匹配')
          if (!entries.has(key)) entries.set(key, { key, intent, durable: true })
        } catch { this.storageUnavailable = true }
      }
    } catch { this.storageUnavailable = true }
    return [...entries.values()]
  }

  private prefix(scope: string): string { return `${PREFIX}${encodeURIComponent(scope)}:` }
  private notify(): void {
    const scope = this.currentScope()
    this.options.onChange(scope ? this.entries(scope).length : 0, this.storageUnavailable)
  }
  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }
}
