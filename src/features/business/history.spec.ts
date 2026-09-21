import { describe, expect, it } from 'vitest'
import { demoHistoryPageSchema, historyCsv, parseHistoryDetail } from './history'

describe('batch history contracts', () => {
  it('retains pagination totals and accepts null list items', () => {
    const page = demoHistoryPageSchema.parse({ data: [{ id: 'demo', tool_id: 'tool', items: null }], total: 45, page: 2, page_size: 20 })
    expect(page.total).toBe(45)
    expect(page.data[0]?.items).toEqual([])
  })
  it('describes attention examples as completed cases, not pending work', () => {
    const detail = parseHistoryDetail('demo', { id: 'demo', tool_id: 'tool', status: 'completed', row_count: 3,
      items: [ { item_ref: 'private-id', status: 'played', simulated_outcome: 'attention_example' }, { item_ref: 'two', status: 'played', simulated_outcome: 'failure_example' }, { item_ref: 'three', status: 'played', simulated_outcome: 'completed_example' } ] })
    expect(detail.items.map(item => item.result)).toEqual(['人工操作案例（无待办）', '异常案例', '完成案例'])
    expect(historyCsv(detail)).not.toContain('private-id')
  })
  it('exports only an allowlist, excluding account text, internal IDs and customer messages', () => {
    const detail = parseHistoryDetail('live', { id: 1, status: 'cancelled', total_count: 1,
      items: [{ client_item_id: 'sensitive-id', account_label_masked: 'customer@private.com', status: 'waiting_user', customer_message: '=HYPERLINK(secret)' }] })
    const csv = historyCsv(detail)
    expect(csv).toContain('账号 1')
    expect(csv).toContain('批次已结束')
    expect(csv).not.toMatch(/sensitive-id|private.com|HYPERLINK/)
  })
  it('neutralizes spreadsheet formula prefixes in all exported fields', () => {
    const csv = historyCsv({ kind: 'live', toolName: 'x', status: 'completed', total: 1,
      items: [{ label: '=1+1', status: '@SUM(1)', result: 'line, "quoted"' }] })
    expect(csv).toContain('"\'=1+1"')
    expect(csv).toContain('"\'@SUM(1)"')
    expect(csv).toContain('"line, ""quoted"""')
  })
})
