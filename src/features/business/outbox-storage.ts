import { z } from 'zod'

const id = z.union([z.string().min(1).max(100), z.number().int().nonnegative()])
const item = z.object({
  batchId: id,
  itemId: z.string().min(1).max(100),
  payload: z.object({
    status: z.enum(['pending', 'running', 'waiting_user', 'completed', 'failed', 'cancelled']),
    intervention_type: z.enum(['login', 'captcha', 'two_factor', 'page_confirmation', 'other']).nullish(),
  }),
})
const summary = z.object({
  batchId: id,
  payload: z.object({
    status: z.enum(['running', 'completed', 'cancelled', 'interrupted']).nullish(),
    pending_count: z.number().int().nonnegative().optional(),
    running_count: z.number().int().nonnegative().optional(),
    waiting_count: z.number().int().nonnegative().optional(),
    completed_count: z.number().int().nonnegative().optional(),
    failed_count: z.number().int().nonnegative().optional(),
  }),
})
const savedSchema = z.object({
  version: z.literal(1),
  items: z.array(item).max(10_000),
  batches: z.array(summary).max(1_000),
  finishes: z.array(z.object({ batchId: id, status: z.enum(['completed', 'cancelled', 'interrupted']) })).max(1_000),
})
export type SavedBusinessOutbox = z.infer<typeof savedSchema>

/** Whitelist-only local receipts. Never save account labels, messages or tool/input data. */
export class BusinessOutboxStorage {
  private readonly key: string
  constructor(scope: string, private readonly storage: () => Storage, private readonly onUnavailable: () => void) {
    this.key = `kst:business-outbox:v1:${encodeURIComponent(scope)}`
  }
  load(): SavedBusinessOutbox | null {
    try {
      const raw = this.storage().getItem(this.key)
      return raw ? savedSchema.parse(JSON.parse(raw)) : null
    } catch {
      this.onUnavailable()
      return null
    }
  }
  save(value: unknown): void {
    try {
      // Zod strips all unapproved keys, including any accidentally added input.
      const safe = savedSchema.parse(value)
      if (!safe.items.length && !safe.batches.length && !safe.finishes.length) this.storage().removeItem(this.key)
      else this.storage().setItem(this.key, JSON.stringify(safe))
    } catch { this.onUnavailable() }
  }
}
