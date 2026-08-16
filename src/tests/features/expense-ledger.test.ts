import { describe, expect, it } from 'vitest'
import {
  expensePageSchema,
  expenseRecordSchema,
  expenseRenewalSchema,
  expenseSummarySchema,
  renewalPageSchema,
  unwrapApiData,
} from '@/features/admin/expenses/model'

describe('公账支出运行时契约', () => {
  it('将 Decimal 字符串归一化为页面可计算的数字', () => {
    const summary = expenseSummarySchema.parse({
      month: '2026-07', total: '1234.50', previous_total: '1000.00', change_percent: '23.45',
      count: 2, upcoming_renewals: 1, overdue_renewals: 0,
      trend: [{ month: '2026-07', total: '1234.50' }],
      categories: [{ category_id: 1, category_name: '开发', total: '1234.50', percentage: '100.00' }],
    })
    expect(summary.total).toBe(1234.5)
    expect(summary.categories[0].percentage).toBe(100)
  })

  it('保留作废信息、续费来源和凭证元数据', () => {
    const record = expenseRecordSchema.parse({
      id: 9, amount: '88.00', expense_date: '2026-07-31', title: '云服务', category_id: 1,
      category_name: '服务器/云服务', status: 'voided', void_reason: '重复记账', renewal_id: 3,
      renewal_name: '云服务器', attachments: [{ id: 2, expense_id: 9, original_name: 'invoice.pdf', mime_type: 'application/pdf', size_bytes: 1024, sha256: 'abc' }],
    })
    expect(record.status).toBe('voided')
    expect(record.void_reason).toBe('重复记账')
    expect(record.attachments[0].original_name).toBe('invoice.pdf')
  })

  it('区分待续费提醒与已处理周期', () => {
    const renewal = expenseRenewalSchema.parse({
      id: 3, name: '设计工具', default_amount: '99.00', category_id: 2, category_name: '工具会员',
      cycle: 'monthly', next_due_on: '2026-08-01', reminder_days: 7, status: 'active', due_state: 'upcoming',
      occurrences: [{ id: 1, renewal_id: 3, due_on: '2026-07-01', status: 'paid', expense_id: 9 }],
    })
    expect(renewal.due_state).toBe('upcoming')
    expect(renewal.occurrences[0].status).toBe('paid')
  })

  it('解析分页响应并兼容统一响应信封', () => {
    const envelope = { success: true, data: { id: 1 } }
    expect(unwrapApiData(envelope)).toEqual({ id: 1 })
    expect(expensePageSchema.parse({ data: [], total: 0, page: 1, page_size: 20, total_pages: 0 }).data).toEqual([])
    expect(renewalPageSchema.parse({ data: [], total: 0, page: 1, page_size: 20, total_pages: 0 }).data).toEqual([])
  })
})
