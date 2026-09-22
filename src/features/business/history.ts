import { z } from 'zod'
import { serverBatchHistorySchema, type BusinessBatchSnapshot } from './model'
import { demoBatchSchema, demoBatchListSchema } from '@/features/demo/model'

export const demoHistoryPageSchema = z.object({
  data: demoBatchListSchema,
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
})
export const liveBatchDetailSchema = serverBatchHistorySchema.extend({
  tool_id: z.union([z.string(), z.number()]).optional(),
  items: z.array(z.object({
    client_item_id: z.string().optional(),
    completed_at: z.string().nullable().optional(),
    status: z.string(),
    account_label_masked: z.string().nullable().optional(),
    intervention_type: z.string().nullable().optional(),
  })).nullish().transform(value => value ?? []),
})
export interface HistoryItem { label: string; status: string; result: string; sourceRow?: number; completedAt?: string | null }
export interface HistoryDetail { kind: 'demo' | 'live'; toolName: string; toolId?: string; status: string; total: number; items: HistoryItem[] }
const demoStatus: Record<string, string> = { queued: '待演示', playing: '演示中', played: '已演示', skipped: '已跳过', error: '演示异常' }
const liveStatus: Record<string, string> = { pending: '等待开始', running: '执行中', waiting_user: '等待操作', completed: '已完成', failed: '未完成', cancelled: '已取消' }

export function parseHistoryDetail(kind: 'demo' | 'live', value: unknown, sourceRows: Record<string, number> = {}): HistoryDetail {
  if (kind === 'demo') {
    const batch = demoBatchSchema.parse(value)
    return { kind, toolName: batch.tool_name_snapshot, toolId: String(batch.tool_id), status: batch.status, total: batch.row_count,
      items: batch.items.map((item, index) => ({ label: `演示项 ${index + 1}`, sourceRow: sourceRows[item.item_ref], status: demoStatus[item.status] || '状态待确认',
        result: item.simulated_outcome === 'attention_example' ? '人工操作案例（无待办）'
          : item.simulated_outcome === 'failure_example' ? '异常案例'
            : item.simulated_outcome === 'completed_example' ? '完成案例' : demoStatus[item.status] || '—' })) }
  }
  const batch = liveBatchDetailSchema.parse(value)
  return { kind, toolName: batch.tool_name, toolId: batch.tool_id === undefined ? undefined : String(batch.tool_id), status: batch.status, total: batch.total_count,
    // Do not export server messages, identifiers, account labels or imported content.
    items: batch.items.map((item, index) => ({ label: `账号 ${index + 1}`, sourceRow: item.client_item_id ? sourceRows[item.client_item_id] : undefined, completedAt: item.completed_at, status: liveStatus[item.status] || '状态待确认',
      result: item.status === 'waiting_user' && batch.status !== 'running' ? '批次已结束，请在本机核对结果' : liveStatus[item.status] || '状态待确认' })) }
}

export function historyCsv(detail: HistoryDetail): string {
  const cell = (value: string): string => `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`
  const rows = [['类型', '账号序号', '原表行号（本机）', '状态', '结果说明', '处理时间'], ...detail.items.map(item => [detail.kind === 'demo' ? '模拟演示' : '真实执行', item.label, item.sourceRow ? String(item.sourceRow) : '未保留', item.status, item.result, item.completedAt || '—'])]
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
}

export function snapshotHistoryDetail(snapshot: BusinessBatchSnapshot): HistoryDetail {
  return { kind: snapshot.recordKind, toolName: snapshot.tool?.name || '批量任务', status: snapshot.status, total: snapshot.items.length,
    items: snapshot.items.map((item, index) => ({ label: `账号 ${index + 1}`, sourceRow: item.sourceRow,
      completedAt: item.finishedAtMs ? new Date(item.finishedAtMs).toISOString() : undefined,
      status: liveStatus[item.status] || '状态待确认',
      result: snapshot.recordKind === 'demo' ? '模拟案例，不代表真实执行结果' : liveStatus[item.status] || '状态待确认',
    })) }
}
