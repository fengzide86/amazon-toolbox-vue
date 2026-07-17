import { reactive, readonly } from 'vue'
import { getApiBase } from '@/shared/api/base'

export type ConnectionStatus = 'unknown' | 'online' | 'degraded' | 'offline' | 'recovering'

export interface ConnectionSnapshot {
  status: ConnectionStatus
  consecutiveFailures: number
  firstFailureAt: number | null
  lastFailureAt: number | null
  lastSuccessAt: number | null
}

const OFFLINE_AFTER_MS = 30_000
const PROBE_DELAYS = [2_000, 8_000, 20_000, 30_000] as const

const mutableState = reactive<ConnectionSnapshot>({
  status: 'unknown',
  consecutiveFailures: 0,
  firstFailureAt: null,
  lastFailureAt: null,
  lastSuccessAt: null,
})

let initialized = false
let probeTimer: ReturnType<typeof setTimeout> | null = null
let activeProbe: Promise<boolean> | null = null

export const connectionState = readonly(mutableState)

function clearProbeTimer(): void {
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = null
}

function applyFailure(now = Date.now()): void {
  mutableState.consecutiveFailures += 1
  mutableState.firstFailureAt ??= now
  mutableState.lastFailureAt = now
  const failureDuration = now - mutableState.firstFailureAt
  mutableState.status = mutableState.consecutiveFailures >= 3 && failureDuration >= OFFLINE_AFTER_MS
    ? 'offline'
    : 'degraded'
}

function scheduleProbe(): void {
  if (probeTimer || activeProbe) return
  const index = Math.min(Math.max(mutableState.consecutiveFailures - 1, 0), PROBE_DELAYS.length - 1)
  probeTimer = setTimeout(() => {
    probeTimer = null
    void probeConnection()
  }, PROBE_DELAYS[index])
}

export function recordConnectionSuccess(now = Date.now()): void {
  clearProbeTimer()
  mutableState.status = 'online'
  mutableState.consecutiveFailures = 0
  mutableState.firstFailureAt = null
  mutableState.lastSuccessAt = now
}

export function recordConnectionFailure(now = Date.now()): void {
  applyFailure(now)
  scheduleProbe()
}

export async function probeConnection(): Promise<boolean> {
  if (activeProbe) return activeProbe
  activeProbe = (async () => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5_000)
    let failed = false
    try {
      const response = await fetch(`${getApiBase()}/api/health/live`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      // Any HTTP response proves the service is reachable. Readiness is handled separately.
      recordConnectionSuccess()
      return response.ok
    } catch {
      applyFailure()
      failed = true
      return false
    } finally {
      clearTimeout(timeoutId)
      activeProbe = null
      if (failed) scheduleProbe()
    }
  })()
  return activeProbe
}

function handleBrowserOnline(): void {
  if (mutableState.status === 'offline' || mutableState.status === 'degraded') {
    mutableState.status = 'recovering'
  }
  clearProbeTimer()
  void probeConnection()
}

function handleBrowserOffline(): void {
  // navigator.onLine is only a hint. The normal hysteresis still applies.
  recordConnectionFailure()
}

export function initializeConnectivity(): () => void {
  if (initialized || typeof window === 'undefined') return () => undefined
  initialized = true
  window.addEventListener('online', handleBrowserOnline)
  window.addEventListener('offline', handleBrowserOffline)
  void probeConnection()
  return () => {
    initialized = false
    clearProbeTimer()
    window.removeEventListener('online', handleBrowserOnline)
    window.removeEventListener('offline', handleBrowserOffline)
  }
}

export function resetConnectivityForTests(): void {
  clearProbeTimer()
  activeProbe = null
  mutableState.status = 'unknown'
  mutableState.consecutiveFailures = 0
  mutableState.firstFailureAt = null
  mutableState.lastFailureAt = null
  mutableState.lastSuccessAt = null
}
