import { z } from 'zod'
import { createDemoRun, getDemoRun, updateDemoRun, finishDemoRun, cancelDemoRun } from '@/utils/api'
import { demoRunSchema, unwrapApiData } from '@/features/demo/model'
import { authService } from '@/utils/auth'
import { getApiBase } from '@/shared/api/base'

const receiptSchema = z.object({
  localId: z.string(), remoteId: z.union([z.string(), z.number()]).optional(), toolId: z.string(), toolName: z.string(), platform: z.string(), scenario: z.string(),
  status: z.enum(['completed', 'failed', 'cancelled']), completedSteps: z.number().int().nonnegative().max(1000),
})
export type DemoReceipt = z.infer<typeof receiptSchema>
const inFlight = new Map<string, Promise<boolean>>()
const memory = new Map<string, Map<string, DemoReceipt>>()

/** Scope identifiers are not credentials. No token, input fields or page content is persisted. */
function currentScope(): string | null {
  const token = authService.getAuth()?.token
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
    if (!claims.user_id || !claims.auth_code_id || !claims.device_id) return null
    return [getApiBase(), claims.user_id, claims.auth_code_id, claims.device_id].map(value => encodeURIComponent(String(value))).join(':')
  } catch { return null }
}

function storageKey(scope: string) { return `kst:demo-receipts:v1:${scope}` }
function receipts(scope: string | null): Map<string, DemoReceipt> {
  const key = scope || 'current-session'
  if (!memory.has(key)) {
    let stored: DemoReceipt[] = []
    if (scope) {
      try { stored = z.array(receiptSchema).parse(JSON.parse(localStorage.getItem(storageKey(scope)) || '[]')) }
      catch { /* A corrupt receipt never blocks the tool or sends arbitrary data. */ }
    }
    memory.set(key, new Map(stored.map(item => [item.localId, item])))
  }
  return memory.get(key)!
}
function persist(scope: string | null) {
  if (!scope) return
  try { localStorage.setItem(storageKey(scope), JSON.stringify([...receipts(scope).values()])) }
  catch { /* Keep the in-memory receipt and surface pending status to the user. */ }
}

async function flushReceipt(receipt: DemoReceipt, scope: string | null): Promise<boolean> {
  const key = `${scope || 'current-session'}:${receipt.localId}`
  const existing = inFlight.get(key)
  if (existing) return existing
  const current = () => currentScope() === scope
  const request = (async () => {
    if (!current()) return false
    try {
      const remote = demoRunSchema.parse(unwrapApiData(receipt.remoteId ? await getDemoRun(receipt.remoteId) : await createDemoRun({
        client_demo_run_id: receipt.localId, tool_id: receipt.toolId, tool_name: receipt.toolName,
        platform_key: receipt.platform, scenario_id: receipt.scenario, total_step_count: 6,
      })))
      if (!current()) return false
      // A previous final request may have committed while its response was
      // lost. Reconcile the server snapshot before sending any older event.
      const terminal = receipt.status === 'failed' ? 'error' : receipt.status
      if (['completed', 'cancelled', 'error'].includes(remote.status)) {
        if (remote.status !== terminal) return false
      } else {
        receipt.remoteId = remote.id
        persist(scope)
        let sequence = remote.event_seq
        if (remote.status === 'created') {
          await updateDemoRun(remote.id, { event_seq: ++sequence, status: 'running', current_step_id: 'prepare', completed_step_count: 0 })
          if (!current()) return false
        }
        if (receipt.status === 'completed') await finishDemoRun(remote.id, { event_seq: sequence + 1, completed_step_count: receipt.completedSteps })
        else if (receipt.status === 'cancelled') await cancelDemoRun(remote.id, sequence + 1)
        else await updateDemoRun(remote.id, { event_seq: sequence + 1, status: 'error', completed_step_count: receipt.completedSteps, error_code: 'DEMO_RUNTIME_ERROR' })
      }
      if (!current()) return false
      receipts(scope).delete(receipt.localId)
      persist(scope)
      return true
    } catch { return false }
  })()
  inFlight.set(key, request)
  try { return await request } finally { inFlight.delete(key) }
}

export async function queueDemoReceipt(receipt: DemoReceipt): Promise<boolean> {
  const safe = receiptSchema.parse(receipt)
  const scope = currentScope()
  receipts(scope).set(safe.localId, safe)
  persist(scope)
  return flushReceipt(safe, scope)
}

export async function flushPendingDemoReceipts(): Promise<void> {
  const scope = currentScope()
  // Serialize to avoid flooding reconnects; each operation is idempotent server-side.
  for (const item of [...receipts(scope).values()]) {
    if (currentScope() !== scope) return
    if (!await flushReceipt(item, scope)) return
  }
}
