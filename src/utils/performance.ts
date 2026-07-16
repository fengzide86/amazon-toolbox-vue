import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals'
import { toolboxVersionHeaders } from '@/shared/api/client-metadata'

export type PerformanceMetricName = 'CLS' | 'INP' | 'LCP' | 'FCP' | 'TTFB'
export type PerformanceRating = 'good' | 'needs-improvement' | 'poor' | 'unknown'

const THRESHOLDS: Record<PerformanceMetricName, { good: number; poor: number }> = {
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
}

function getApiBase(): string {
  try {
    return localStorage.getItem('toolbox_api_base') || 'http://localhost:8000'
  } catch {
    return 'http://localhost:8000'
  }
}

export function initPerformanceMonitoring(): void {
  onCLS(metric => sendToAnalytics('CLS', metric.value))
  onINP(metric => sendToAnalytics('INP', metric.value))
  onLCP(metric => sendToAnalytics('LCP', metric.value))
  onFCP(metric => sendToAnalytics('FCP', metric.value))
  onTTFB(metric => sendToAnalytics('TTFB', metric.value))
}

function sendToAnalytics(name: PerformanceMetricName, value: number): void {
  if (!import.meta.env.PROD) return
  void fetch(`${getApiBase()}/api/analytics/performance`, {
    method: 'POST',
    headers: toolboxVersionHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ metric: name, value, timestamp: Date.now(), url: window.location.href }),
    keepalive: true,
  }).catch(error => console.warn('[Performance] Failed to send analytics:', error))
}

export function getPerformanceRating(metric: string, value: number): PerformanceRating {
  const threshold = metric in THRESHOLDS ? THRESHOLDS[metric as PerformanceMetricName] : undefined
  if (!threshold) return 'unknown'
  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}
