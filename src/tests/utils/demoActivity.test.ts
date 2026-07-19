import { afterEach, describe, expect, it, vi } from 'vitest'

import { demoActivityToken, setDemoActivity } from '@/utils/demoActivity'

describe('demo activity bridge', () => {
  afterEach(() => {
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI
  })

  it('normalizes tokens to the desktop allowlist', () => {
    expect(demoActivityToken('batch', '含空格/id')).toBe('batch:____id')
  })

  it('sets and clears the same token through the optional Electron bridge', async () => {
    const setActive = vi.fn().mockResolvedValue(undefined)
    ;(window as typeof window & { electronAPI?: unknown }).electronAPI = { demoActivity: { setActive } }

    await setDemoActivity('single:run_1', true)
    await setDemoActivity('single:run_1', false)

    expect(setActive).toHaveBeenNthCalledWith(1, 'single:run_1', true)
    expect(setActive).toHaveBeenNthCalledWith(2, 'single:run_1', false)
  })
})
