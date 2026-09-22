import { z } from 'zod'
import type { BusinessBatchSnapshot } from './model'

const rowsSchema = z.record(z.string().max(100), z.number().int().positive())
function key(scope: string, kind: 'demo' | 'live', batchId: string | number): string {
  return `kst:batch-source-rows:v1:${encodeURIComponent(scope)}:${kind}:${batchId}`
}
/** Only source row numbers are retained locally; no filename, cell values or account aliases. */
export function saveSourceRows(scope: string | null, snapshot: BusinessBatchSnapshot): void {
  if (!scope || snapshot.serverBatchId === undefined) return
  const rows = Object.fromEntries(snapshot.items.flatMap(item => item.sourceRow ? [[item.itemId, item.sourceRow]] : []))
  if (!Object.keys(rows).length) return
  localStorage.setItem(key(scope, snapshot.recordKind, snapshot.serverBatchId), JSON.stringify(rowsSchema.parse(rows)))
}
export function readSourceRows(scope: string | null, kind: 'demo' | 'live', batchId: string | number): Record<string, number> {
  if (!scope) return {}
  try { return rowsSchema.parse(JSON.parse(localStorage.getItem(key(scope, kind, batchId)) || '{}')) }
  catch { return {} }
}
