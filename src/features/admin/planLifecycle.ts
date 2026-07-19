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
 * Active plans may only change display fields. Commercial terms are included
 * only while the plan is disabled, matching the backend lifecycle invariant.
 */
export function buildDisplayPlanPatch(plan: AdminPlan): Record<string, unknown> {
  if (plan.status === 'archived') throw new Error('Archived plans are immutable')

  const patch: Record<string, unknown> = {
    name: plan.name.trim(),
    features: plan.features || null,
  }
  if (plan.status === 'disabled') {
    if (!Number.isFinite(plan.price) || plan.price <= 0) throw new Error('Plan price must be positive')
    if (!Number.isInteger(plan.duration_days) || Number(plan.duration_days) <= 0) throw new Error('Plan duration must be positive')
    patch.price = plan.price
    patch.duration_days = plan.duration_days
  }
  return patch
}

export function buildPlanPermissionsPatch(draft: PlanPermissionDraft): Record<string, unknown> {
  if (draft.status !== 'disabled') throw new Error('Plan must be disabled')
  const isBusiness = draft.product_type === 'business'
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
