/**
 * 性能监控工具
 * 使用 web-vitals 收集关键性能指标
 */

import { onCLS, onFID, onLCP, onFCP, onTTFB } from 'web-vitals'

/**
 * 初始化性能监控
 */
export function initPerformanceMonitoring() {
  // Cumulative Layout Shift (CLS) - 累积布局偏移
  onCLS((metric) => {
    console.log('[Performance] CLS:', metric.value)
    sendToAnalytics('CLS', metric.value)
  })

  // First Input Delay (FID) - 首次输入延迟
  onFID((metric) => {
    console.log('[Performance] FID:', metric.value, 'ms')
    sendToAnalytics('FID', metric.value)
  })

  // Largest Contentful Paint (LCP) - 最大内容绘制
  onLCP((metric) => {
    console.log('[Performance] LCP:', metric.value, 'ms')
    sendToAnalytics('LCP', metric.value)
  })

  // First Contentful Paint (FCP) - 首次内容绘制
  onFCP((metric) => {
    console.log('[Performance] FCP:', metric.value, 'ms')
    sendToAnalytics('FCP', metric.value)
  })

  // Time to First Byte (TTFB) - 首字节时间
  onTTFB((metric) => {
    console.log('[Performance] TTFB:', metric.value, 'ms')
    sendToAnalytics('TTFB', metric.value)
  })
}

/**
 * 发送性能数据到分析服务
 * @param {string} name - 指标名称
 * @param {number} value - 指标值
 */
function sendToAnalytics(name, value) {
  // 可以在这里集成 Sentry、Google Analytics 等
  // 示例：发送到后端 API
  if (import.meta.env.PROD) {
    fetch('/api/analytics/performance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metric: name,
        value: value,
        timestamp: Date.now(),
        url: window.location.href,
      }),
      keepalive: true,
    }).catch((err) => {
      console.warn('[Performance] Failed to send analytics:', err)
    })
  }
}

/**
 * 获取性能评级
 * @param {string} metric - 指标名称
 * @param {number} value - 指标值
 * @returns {string} 评级 (good/needs-improvement/poor)
 */
export function getPerformanceRating(metric, value) {
  const thresholds = {
    CLS: { good: 0.1, poor: 0.25 },
    FID: { good: 100, poor: 300 },
    LCP: { good: 2500, poor: 4000 },
    FCP: { good: 1800, poor: 3000 },
    TTFB: { good: 800, poor: 1800 },
  }

  const threshold = thresholds[metric]
  if (!threshold) return 'unknown'

  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}