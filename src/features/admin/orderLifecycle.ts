import type { components } from '@/shared/api/openapi.generated'

export interface PendingOrderDraft {
  plan_id: string | number
  amount: number
  channel: string
  responsible: string
}

/** New orders are always pending; status transitions use dedicated endpoints. */
export function buildPendingOrderPayload(
  draft: PendingOrderDraft,
  platformKey?: string,
): components['schemas']['OrderCreate'] {
  return {
    plan_id: Number(draft.plan_id),
    amount: draft.amount,
    channel: draft.channel.trim() || null,
    responsible: draft.responsible.trim() || null,
    ...(platformKey ? { platform_key: platformKey } : {}),
  }
}
