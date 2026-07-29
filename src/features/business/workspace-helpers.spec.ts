import { describe, expect, it, vi } from 'vitest'

import { createClientBatchId, importOptions, statusText, toolCapabilityKey, unwrapData } from './workspace-helpers'

describe('business workspace helpers', () => {
  it('derives stable importer capabilities without changing tool objects', () => {
    const tool = {
      id: 'listing',
      name: 'Listing',
      availability: 'demo_only' as const,
      demo_scenario_id: 'listing-demo',
      supports_demo_batch: true,
      supports_live_batch: false,
      script_key: 'demo.listing_script_walkthrough_v1',
    }
    expect(toolCapabilityKey(tool)).toBe('listing_script')
    expect(importOptions(tool, 45)).toEqual({ capabilityKey: 'listing_script', schema: [], maxRows: 45 })
    expect(tool).not.toHaveProperty('capability_key')
  })

  it('unwraps API envelopes and preserves raw values', () => {
    expect(unwrapData({ data: [1, 2] })).toEqual([1, 2])
    expect(unwrapData([1, 2])).toEqual([1, 2])
    expect(statusText('running')).toBe('正在处理')
    expect(statusText('custom')).toBe('custom')
  })

  it('creates unique client batch identifiers', () => {
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(array => {
      const values = array as Uint32Array
      values[0] = 1
      values[1] = 2
      return array
    })
    expect(createClientBatchId(100)).toBe('batch_100_12')
  })
})
