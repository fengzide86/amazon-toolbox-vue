import { api, API_BASE, type ApiQueryParams } from './index'
import { authService } from '../auth'
import { toolboxVersionHeaders } from '@/shared/api/client-metadata'
import type { ExpensePayload, RenewalPayload } from '@/features/admin/expenses/model'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type Schemas = components['schemas']
type ExpenseSummaryWire = Schemas['ExpenseSummaryResponse']
type ExpenseCategoryWire = Schemas['ExpenseCategoryResponse']
type ExpenseRecordWire = Schemas['ExpenseRecordResponse']
type ExpenseRenewalWire = Schemas['ExpenseRenewalResponse']
type ExpensePageWire = Schemas['PaginatedResponse_ExpenseRecordResponse_']
type RenewalPageWire = Schemas['PaginatedResponse_ExpenseRenewalResponse_']
type ExpenseRecordEnvelope = Schemas['APIResponse_ExpenseRecordResponse_']
type ExpenseRenewalEnvelope = Schemas['APIResponse_ExpenseRenewalResponse_']
type ExpenseCategoryEnvelope = Schemas['APIResponse_ExpenseCategoryResponse_']
type ExpenseConfirmEnvelope = Schemas['APIResponse_ExpenseRenewalConfirmResponse_']

function authHeaders(): Record<string, string> {
  const token = authService.getAuth()?.token || localStorage.getItem('toolbox_token')
  return toolboxVersionHeaders(token ? { Authorization: `Bearer ${token}` } : {})
}

function queryString(params: ApiQueryParams): string {
  return new URLSearchParams(
    Object.entries(params)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString()
}

export const getExpenseSummary = (month?: string): Promise<ExpenseSummaryWire> =>
  api.get('/api/expenses/summary', month ? { month } : {}, { cache: false })
export const getExpenseCategories = (includeArchived = true): Promise<ExpenseCategoryWire[]> =>
  api.get('/api/expenses/categories', { include_archived: includeArchived }, { cache: false })
export const createExpenseCategory = (data: { name: string; sort_order: number }): Promise<ExpenseCategoryEnvelope> =>
  api.post('/api/expenses/categories', data)
export const updateExpenseCategory = (id: EntityId, data: { name?: string; sort_order?: number; status?: 'active' | 'archived' }): Promise<ExpenseCategoryWire> =>
  api.patch(`/api/expenses/categories/${encodeURIComponent(String(id))}`, data)

export const getExpenses = (params: ApiQueryParams = {}): Promise<ExpensePageWire> =>
  api.get('/api/expenses', params, { cache: false, responseMode: 'raw' })
export const getExpense = (id: EntityId): Promise<ExpenseRecordWire> =>
  api.get(`/api/expenses/${encodeURIComponent(String(id))}`, {}, { cache: false })
export const createExpense = (data: ExpensePayload): Promise<ExpenseRecordEnvelope> => api.post('/api/expenses', data)
export const updateExpense = (id: EntityId, data: Partial<ExpensePayload>): Promise<ExpenseRecordWire> =>
  api.patch(`/api/expenses/${encodeURIComponent(String(id))}`, data)
export const voidExpense = (id: EntityId, reason: string): Promise<ExpenseRecordEnvelope> =>
  api.post(`/api/expenses/${encodeURIComponent(String(id))}/void`, { reason })

export const getExpenseRenewals = (params: ApiQueryParams = {}): Promise<RenewalPageWire> =>
  api.get('/api/expenses/renewals', params, { cache: false, responseMode: 'raw' })
export const getExpenseRenewal = (id: EntityId): Promise<ExpenseRenewalWire> =>
  api.get(`/api/expenses/renewals/${encodeURIComponent(String(id))}`, {}, { cache: false })
export const createExpenseRenewal = (data: RenewalPayload): Promise<ExpenseRenewalEnvelope> => api.post('/api/expenses/renewals', data)
export const updateExpenseRenewal = (id: EntityId, data: Partial<RenewalPayload>): Promise<ExpenseRenewalWire> =>
  api.patch(`/api/expenses/renewals/${encodeURIComponent(String(id))}`, data)
export const confirmExpenseRenewal = (id: EntityId, data: { due_on: string; amount?: number; expense_date?: string; note?: string | null }): Promise<ExpenseConfirmEnvelope> =>
  api.post(`/api/expenses/renewals/${encodeURIComponent(String(id))}/confirm`, data)
export const skipExpenseRenewal = (id: EntityId, dueOn: string, note?: string): Promise<ExpenseRenewalEnvelope> =>
  api.post(`/api/expenses/renewals/${encodeURIComponent(String(id))}/skip`, { due_on: dueOn, note: note || null })
export const pauseExpenseRenewal = (id: EntityId): Promise<ExpenseRenewalEnvelope> =>
  api.post(`/api/expenses/renewals/${encodeURIComponent(String(id))}/pause`)
export const resumeExpenseRenewal = (id: EntityId, nextDueOn: string): Promise<ExpenseRenewalEnvelope> =>
  api.post(`/api/expenses/renewals/${encodeURIComponent(String(id))}/resume`, { next_due_on: nextDueOn })
export const endExpenseRenewal = (id: EntityId): Promise<ExpenseRenewalEnvelope> =>
  api.post(`/api/expenses/renewals/${encodeURIComponent(String(id))}/end`)

export async function exportExpenses(params: ApiQueryParams = {}): Promise<Blob> {
  const query = queryString(params)
  const response = await fetch(`${API_BASE}/api/expenses/export${query ? `?${query}` : ''}`, { headers: authHeaders() })
  if (!response.ok) throw new Error('支出流水导出失败')
  return response.blob()
}

export async function uploadExpenseAttachment(expenseId: EntityId, file: File): Promise<Schemas['APIResponse_ExpenseAttachmentResponse_']> {
  const body = new FormData()
  body.append('file', file)
  return api.post(`/api/expenses/${encodeURIComponent(String(expenseId))}/attachments`, body)
}

export async function downloadExpenseAttachment(expenseId: EntityId, attachmentId: EntityId): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/expenses/${encodeURIComponent(String(expenseId))}/attachments/${encodeURIComponent(String(attachmentId))}`, { headers: authHeaders() })
  if (!response.ok) throw new Error('凭证下载失败')
  return response.blob()
}

export const deleteExpenseAttachment = (expenseId: EntityId, attachmentId: EntityId): Promise<unknown> =>
  api.delete(`/api/expenses/${encodeURIComponent(String(expenseId))}/attachments/${encodeURIComponent(String(attachmentId))}`)
