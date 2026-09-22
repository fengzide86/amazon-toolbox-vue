import { z } from 'zod'

const decimal = z.union([
  z.number(),
  z.string().regex(/^-?\d+(?:\.\d+)?$/),
]).transform(value => Number(value)).refine(Number.isFinite, '必须是有限金额')
const id = z.number().int().positive()
export const commissionMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
export const commissionPolicySchema = z.object({
  agency_id: id,
  rate: decimal.pipe(z.number().min(0).max(1)).nullable(),
})
export const commissionSummarySchema = z.object({
  pending_amount: decimal,
  settled_amount: decimal,
  accrued_amount: decimal,
  refunded_amount: decimal,
})
export const commissionEntrySchema = z.object({
  id,
  agency_id: id,
  order_id: id,
  order_no: z.string(),
  kind: z.enum(['accrual', 'refund']),
  amount: decimal,
  rate_snapshot: decimal,
  order_amount_snapshot: decimal,
  occurred_at: z.string().nullable().optional(),
  settlement_id: id.nullable(),
})
export const commissionSettlementSchema = z.object({
  id,
  agency_id: id,
  month: commissionMonthSchema,
  amount: decimal,
  count: z.number().int().nonnegative(),
  confirmed_at: z.string().min(1),
  note: z.string(),
})
export const commissionPreviewSchema = z.object({
  agency_id: id,
  month: commissionMonthSchema,
  amount: decimal,
  count: z.number().int().nonnegative(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  existing_settlement: commissionSettlementSchema.nullable(),
})
export const commissionPolicyUpdateSchema = z.object({
  rate: z.number().finite().min(0).max(1).nullable(),
  expected_rate: z.number().finite().min(0).max(1).nullable(),
})
export const commissionSettlementConfirmSchema = z.object({
  month: commissionMonthSchema,
  expected_revision: z.string().regex(/^[a-f0-9]{64}$/),
  note: z.string().trim().min(1).max(1000),
})
export type CommissionPolicy = z.infer<typeof commissionPolicySchema>
export type CommissionSummary = z.infer<typeof commissionSummarySchema>
export type CommissionEntry = z.infer<typeof commissionEntrySchema>
export type CommissionSettlement = z.infer<typeof commissionSettlementSchema>
export type CommissionPreview = z.infer<typeof commissionPreviewSchema>
export type CommissionSettlementConfirm = z.infer<typeof commissionSettlementConfirmSchema>
