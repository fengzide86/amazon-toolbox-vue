import type { AdminPlan } from '@/features/admin/model'

export interface PlanPermissionDraft {
  id: string | number
  status: 'disabled'
  product_type: 'consumer' | 'business'
  batchEnabled: boolean
  maxBatchRows: number
  maxOpenSessions: number
  desktopNotification: boolean
}

/**
 * Active plans may change their price or display fields. The price is used for
 * new orders; historical order snapshots are not rewritten. Duration
 * and product permissions remain disabled-plan-only fields.
 */
export function buildDisplayPlanPatch(plan: AdminPlan, original: AdminPlan): Record<string, unknown> {
  if (plan.status !== 'active' && plan.status !== 'disabled') throw new Error('当前套餐不可编辑')
  if (plan.id !== original.id || plan.status !== original.status) throw new Error('套餐状态已变化，请重新打开编辑')
  const name = plan.name.trim()
  if (!name || name.length > 100) throw new Error('套餐名称需为 1–100 个字符')
  if (
    !Number.isFinite(plan.price) || plan.price <= 0 || plan.price > 99999999.99
    || Math.abs(plan.price * 100 - Math.round(plan.price * 100)) > 0.000001
  ) throw new Error('套餐价格需大于 0、最多两位小数，且不超过 99,999,999.99 元')

  // Send only intentional changes: a description edit must not restore an old price.
  const patch: Record<string, unknown> = {}
  if (name !== original.name.trim()) patch.name = name
  if ((plan.features || null) !== (original.features || null)) patch.features = plan.features || null
  if (plan.price !== original.price) {
    patch.price = plan.price
    patch.expected_price = original.price
  }
  if (plan.status === 'disabled') {
    if (!Number.isInteger(plan.duration_days) || Number(plan.duration_days) <= 0 || Number(plan.duration_days) > 3650) {
      throw new Error('有效期需为 1–3650 的整数天数')
    }
    if (plan.duration_days !== original.duration_days) patch.duration_days = plan.duration_days
  }
  return patch
}

export function buildPlanPermissionsPatch(draft: PlanPermissionDraft): Record<string, unknown> {
  if (draft.status !== 'disabled') throw new Error('Plan must be disabled')
  const isBusiness = draft.product_type === 'business'
  if (isBusiness && (!Number.isInteger(draft.maxBatchRows) || draft.maxBatchRows < 1 || draft.maxBatchRows > 1000)) {
    throw new Error('真实任务单批行数需为 1–1000 的整数')
  }
  if (isBusiness && (!Number.isInteger(draft.maxOpenSessions) || draft.maxOpenSessions < 2 || draft.maxOpenSessions > 10)) {
    throw new Error('真实任务保留现场数需为 2–10 的整数，不代表并发执行数')
  }
  return {
    product_type: draft.product_type,
    entitlements: {
      batch_execution: isBusiness && draft.batchEnabled,
      multi_account_workspace: isBusiness && draft.batchEnabled,
      desktop_notification: draft.desktopNotification,
      usage_metering: false,
      max_batch_rows: draft.maxBatchRows,
      max_open_sessions: draft.maxOpenSessions,
    },
  }
}
