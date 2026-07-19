import { describe, expect, it } from 'vitest'

import { failedDataState, settledDataState } from '@/features/async/state'

describe('async data state', () => {
  it('does not turn an initial request failure into an empty state', () => {
    expect(failedDataState(false)).toBe('error')
  })

  it('marks retained data stale when a refresh fails', () => {
    expect(failedDataState(true)).toBe('stale')
  })

  it('separates a successful empty response from data', () => {
    expect(settledDataState(0)).toBe('empty')
    expect(settledDataState(2)).toBe('data')
  })
})
