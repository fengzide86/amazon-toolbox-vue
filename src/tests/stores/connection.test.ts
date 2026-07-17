import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectionState,
  probeConnection,
  recordConnectionFailure,
  recordConnectionSuccess,
  resetConnectivityForTests,
} from '@/features/connectivity/state'

describe('connection state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
    resetConnectivityForTests()
  })

  afterEach(() => {
    resetConnectivityForTests()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps a single transient failure quiet', () => {
    recordConnectionFailure(1_000)
    expect(connectionState.status).toBe('degraded')
    expect(connectionState.consecutiveFailures).toBe(1)
  })

  it('only reports offline after repeated failures spanning thirty seconds', () => {
    recordConnectionFailure(1_000)
    recordConnectionFailure(16_000)
    expect(connectionState.status).toBe('degraded')
    recordConnectionFailure(31_000)
    expect(connectionState.status).toBe('offline')
  })

  it('recovers immediately after any successful response', () => {
    recordConnectionFailure(1_000)
    recordConnectionFailure(16_000)
    recordConnectionFailure(31_000)
    recordConnectionSuccess(32_000)
    expect(connectionState.status).toBe('online')
    expect(connectionState.consecutiveFailures).toBe(0)
  })

  it('treats any HTTP response as reachable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await expect(probeConnection()).resolves.toBe(false)
    expect(connectionState.status).toBe('online')
  })
})
