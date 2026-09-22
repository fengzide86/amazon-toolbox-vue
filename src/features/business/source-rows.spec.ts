import { afterEach, describe, expect, it, vi } from 'vitest'
import { historyCsv, parseHistoryDetail } from './history'
import { businessBatchSnapshotSchema } from './model'
import { readSourceRows, saveSourceRows } from './source-rows'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

describe('local source row mapping', () => {
  it('keeps only source row numbers under the authorization scope', () => {
    const snapshot = { serverBatchId: 12, recordKind: 'live' as const, fileName: 'private-accounts.xlsx', items: [
      { itemId: 'one', sourceRow: 4, status: 'completed', browserReady: false, accountLabelMasked: 'private-alias', input: { account: 'private@example.com', password: 'private-password' } },
      { itemId: 'two', status: 'failed', browserReady: false },
    ], status: 'completed', counts: {} } as Parameters<typeof saveSourceRows>[1]
    saveSourceRows('owner-a', snapshot)
    expect(readSourceRows('owner-a', 'live', 12)).toEqual({ one: 4 })
    expect(readSourceRows('owner-b', 'live', 12)).toEqual({})
    expect(readSourceRows('owner-a', 'demo', 12)).toEqual({})
    expect(readSourceRows('owner-a', 'live', 13)).toEqual({})
    expect(localStorage.getItem('kst:batch-source-rows:v1:owner-a:live:12')).toBe('{"one":4}')
  })

  it.each(['demo', 'live'] as const)('reconciles reordered %s history by item ID instead of visible row position', kind => {
    saveSourceRows('owner-a', businessBatchSnapshotSchema.parse({ serverBatchId: 12, recordKind: kind, items: [
      { itemId: 'first', sourceRow: 4, status: 'completed' },
      { itemId: 'last', sourceRow: 9, status: 'completed' },
    ] }))
    const items = ['last', 'first', 'missing'].map(id => kind === 'demo'
      ? { item_ref: id, status: 'played', simulated_outcome: 'completed_example' }
      : { client_item_id: id, status: 'completed' })
    const detail = parseHistoryDetail(kind, { id: 12, tool_id: 'tool', status: 'completed', row_count: 3, total_count: 3, items }, readSourceRows('owner-a', kind, 12))
    expect(detail.items.map(item => item.sourceRow)).toEqual([9, 4, undefined])
    const csv = historyCsv(detail).split('\r\n')
    expect(csv[1]).toContain(',"9",')
    expect(csv[2]).toContain(',"4",')
    expect(csv[3]).toContain(',"未保留",')
  })

  it('does not save without an owner, a server batch, or actual spreadsheet rows', () => {
    const snapshot = businessBatchSnapshotSchema.parse({ serverBatchId: 12, items: [{ itemId: 'one', sourceRow: 4, status: 'pending' }] })
    saveSourceRows(null, snapshot)
    saveSourceRows('owner-a', { ...snapshot, serverBatchId: undefined })
    saveSourceRows('owner-a', { ...snapshot, items: [{ itemId: 'sample', status: 'pending', browserReady: false }] })
    expect(localStorage.length).toBe(0)
    expect(readSourceRows(null, 'live', 12)).toEqual({})
  })

  it.each(['{broken', '{"one":0}', '{"one":1.5}', '{"one":"4"}', '{"one":{"password":"secret"}}'])('ignores invalid stored row maps: %s', serialized => {
    localStorage.setItem('kst:batch-source-rows:v1:owner-a:live:12', serialized)
    expect(readSourceRows('owner-a', 'live', 12)).toEqual({})
  })

  it('tolerates inaccessible reads and surfaces failed writes to the existing workspace warning', () => {
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
    expect(readSourceRows('owner-a', 'live', 12)).toEqual({})
    expect(getItem).toHaveBeenCalledOnce()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('storage full') })
    const snapshot = businessBatchSnapshotSchema.parse({ serverBatchId: 12, items: [{ itemId: 'one', sourceRow: 4, status: 'pending' }] })
    expect(() => saveSourceRows('owner-a', snapshot)).toThrow('storage full')
  })
})
