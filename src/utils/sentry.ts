import type { App } from 'vue'
import type { Router } from 'vue-router'
import type * as SentryTypes from '@sentry/vue'

type SentryModule = typeof SentryTypes
type SentryMessageLevel = NonNullable<Parameters<SentryModule['captureMessage']>[1]>

type SentryContext = Record<string, unknown>
type SentryUser = { id?: string | number; name?: string } | null

let sentryLoad: Promise<SentryModule> | null = null
let initializationContext: { app: App; router: Router } | null = null
let initialized = false

function shouldUseSentry(): boolean {
  return Boolean(import.meta.env.VITE_SENTRY_DSN)
    && (import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true')
}

function loadSentry(): Promise<SentryModule> {
  if (!sentryLoad) {
    sentryLoad = import('@sentry/vue').catch(error => {
      // A transient chunk/network failure must not permanently disable Sentry.
      sentryLoad = null
      throw error
    })
  }
  return sentryLoad
}

function reportSentryFailure(action: string, error: unknown): void {
  console.warn(`[Sentry] ${action}失败:`, error)
}

async function readySentry(): Promise<SentryModule> {
  const Sentry = await loadSentry()
  if (!initializationContext || initialized) return Sentry
  const { app, router } = initializationContext
  const dsn = import.meta.env.VITE_SENTRY_DSN
  Sentry.init({
    app,
    dsn,
    integrations: [
      Sentry.browserTracingIntegration({ router }),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
    replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 0,
    replaysOnErrorSampleRate: 1,
    environment: import.meta.env.MODE || 'development',
    release: `kst@${import.meta.env.VITE_APP_VERSION || 'unknown'}`,
    ignoreErrors: ['Failed to fetch', 'NetworkError', 'AbortError', 'Script error'],
    beforeSend: event => event,
  })
  initialized = true
  return Sentry
}

export function initSentry(app: App, router: Router): void {
  if (!shouldUseSentry()) return
  // Keep the configuration so a later reporting call can retry initialization,
  // not merely download an SDK with no configured client after a chunk failure.
  initializationContext = { app, router }
  void readySentry().catch(error => {
    reportSentryFailure('初始化', error)
  })
}

export function captureException(error: Error | unknown, context: SentryContext = {}): void {
  if (import.meta.env.PROD) {
    if (shouldUseSentry()) {
      void readySentry()
        .then(Sentry => Sentry.captureException(error, { contexts: { custom: context } }))
        .catch(error => reportSentryFailure('捕获异常', error))
    }
    return
  }
  console.error('[Sentry] 捕获异常:', error, context)
}

export function captureMessage(
  message: string,
  level: SentryMessageLevel = 'info',
): void {
  if (import.meta.env.PROD) {
    if (shouldUseSentry()) {
      void readySentry()
        .then(Sentry => Sentry.captureMessage(message, level))
        .catch(error => reportSentryFailure('捕获消息', error))
    }
    return
  }
  console.log(`[Sentry] ${String(level)}:`, message)
}

export function setSentryUser(user: SentryUser): void {
  if (!shouldUseSentry()) return
  void readySentry()
    .then(Sentry => {
      Sentry.setUser(user ? { id: user.id === undefined ? undefined : String(user.id), username: user.name } : null)
    })
    .catch(error => reportSentryFailure('设置用户', error))
}

export function addSentryBreadcrumb(breadcrumb: Parameters<SentryModule['addBreadcrumb']>[0]): void {
  if (!shouldUseSentry()) return
  void readySentry()
    .then(Sentry => Sentry.addBreadcrumb(breadcrumb))
    .catch(error => reportSentryFailure('添加 breadcrumb', error))
}
