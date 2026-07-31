import { z } from 'zod'

const nullableText = z.string().nullable().optional()

export const expenseCategorySchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  status: z.enum(['active', 'archived']),
  sort_order: z.coerce.number().int().nonnegative(),
  is_system: z.boolean(),
  created_at: nullableText,
  updated_at: nullableText,
})

export const expenseAttachmentSchema = z.object({
  id: z.coerce.number().int().positive(),
  expense_id: z.coerce.number().int().positive(),
  original_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.coerce.number().int().nonnegative(),
  sha256: z.string(),
  created_at: nullableText,
})

export const expenseRecordSchema = z.object({
  id: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  currency: z.literal('CNY').default('CNY'),
  expense_date: z.string(),
  title: z.string(),
  category_id: z.coerce.number().int().positive(),
  category_name: z.string(),
  payee: nullableText,
  note: nullableText,
  status: z.enum(['active', 'voided']),
  renewal_id: z.coerce.number().int().positive().nullable().optional(),
  renewal_name: nullableText,
  renewal_due_on: nullableText,
  created_by_name: nullableText,
  voided_at: nullableText,
  void_reason: nullableText,
  created_at: nullableText,
  updated_at: nullableText,
  attachments: z.array(expenseAttachmentSchema).default([]),
})

const trendPointSchema = z.object({ month: z.string(), total: z.coerce.number().nonnegative() })
const categoryTotalSchema = z.object({
  category_id: z.coerce.number().int().positive(),
  category_name: z.string(),
  total: z.coerce.number().nonnegative(),
  percentage: z.coerce.number().min(0),
})

export const expenseSummarySchema = z.object({
  month: z.string(),
  total: z.coerce.number().nonnegative(),
  previous_total: z.coerce.number().nonnegative(),
  change_percent: z.coerce.number(),
  count: z.coerce.number().int().nonnegative(),
  upcoming_renewals: z.coerce.number().int().nonnegative(),
  overdue_renewals: z.coerce.number().int().nonnegative(),
  trend: z.array(trendPointSchema).default([]),
  categories: z.array(categoryTotalSchema).default([]),
})

export const renewalOccurrenceSchema = z.object({
  id: z.coerce.number().int().positive(),
  renewal_id: z.coerce.number().int().positive(),
  due_on: z.string(),
  status: z.enum(['paid', 'skipped']),
  expense_id: z.coerce.number().int().positive().nullable().optional(),
  note: nullableText,
  processed_at: nullableText,
})

export const expenseRenewalSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
  vendor: nullableText,
  default_amount: z.coerce.number().positive(),
  category_id: z.coerce.number().int().positive(),
  category_name: z.string(),
  cycle: z.enum(['monthly', 'quarterly', 'semiannual', 'annual']),
  next_due_on: z.string(),
  reminder_days: z.coerce.number().int().min(0).max(90),
  status: z.enum(['active', 'paused', 'ended']),
  due_state: z.enum(['upcoming', 'due', 'overdue', 'scheduled', 'paused', 'ended']),
  note: nullableText,
  created_at: nullableText,
  updated_at: nullableText,
  occurrences: z.array(renewalOccurrenceSchema).default([]),
})

export const expensePageSchema = z.object({
  data: z.array(expenseRecordSchema).default([]),
  total: z.coerce.number().int().nonnegative().default(0),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().default(20),
  total_pages: z.coerce.number().int().nonnegative().default(0),
})

export const renewalPageSchema = z.object({
  data: z.array(expenseRenewalSchema).default([]),
  total: z.coerce.number().int().nonnegative().default(0),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().default(20),
  total_pages: z.coerce.number().int().nonnegative().default(0),
})

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>
export type ExpenseRecord = z.infer<typeof expenseRecordSchema>
export type ExpenseSummary = z.infer<typeof expenseSummarySchema>
export type ExpenseRenewal = z.infer<typeof expenseRenewalSchema>

export interface ExpensePayload {
  amount: number
  expense_date: string
  title: string
  category_id: number
  payee?: string | null
  note?: string | null
}

export interface RenewalPayload {
  name: string
  vendor?: string | null
  default_amount: number
  category_id: number
  cycle: ExpenseRenewal['cycle']
  next_due_on: string
  reminder_days: number
  note?: string | null
}

export function unwrapApiData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('data' in value)) return value
  return (value as { data: unknown }).data
}
