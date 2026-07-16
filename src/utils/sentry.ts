import * as Sentry from '@sentry/vue'
import type { App } from 'vue'
import type { Router } from 'vue-router'

type SentryContext = Record<string, unknown>
type SentryUser = { id?: string | number; name?: string } | null

export function initSentry(app: App, router: Router): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  const isEnabled = import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true'
  if (!isEnabled) return

  try {
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
      release: `amazon-toolbox@${import.meta.env.PACKAGE_VERSION || '1.0.0'}`,
      ignoreErrors: ['Failed to fetch', 'NetworkError', 'AbortError', 'Script error'],
      beforeSend: event => event,
    })
  } catch (error) {
    console.error('[Sentry] 初始化失败:', error)
  }
}

export function captureException(error: Error | unknown, context: SentryContext = {}): void {
  if (import.meta.env.PROD) Sentry.captureException(error, { contexts: { custom: context } })
  else console.error('[Sentry] 捕获异常:', error, context)
}

export function captureMessage(
  message: string,
  level: NonNullable<Parameters<typeof Sentry.captureMessage>[1]> = 'info',
): void {
  if (import.meta.env.PROD) Sentry.captureMessage(message, level)
  else console.log(`[Sentry] ${String(level)}:`, message)
}

export function setSentryUser(user: SentryUser): void {
  Sentry.setUser(user ? { id: user.id === undefined ? undefined : String(user.id), username: user.name } : null)
}

export function addSentryBreadcrumb(breadcrumb: Parameters<typeof Sentry.addBreadcrumb>[0]): void {
  Sentry.addBreadcrumb(breadcrumb)
}
