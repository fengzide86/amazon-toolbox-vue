import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('sentry lazy loading', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('does not leak a rejected lazy import from initialization', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
    vi.stubEnv('VITE_SENTRY_ENABLED', 'true')
    vi.doMock('@sentry/vue', () => Promise.reject(new Error('chunk unavailable')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { initSentry } = await import('@/utils/sentry')

    initSentry({} as never, {} as never)
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('[Sentry] 初始化失败:', expect.any(Error)))
  })

  it('catches SDK method failures without an unhandled rejection', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
    vi.stubEnv('VITE_SENTRY_ENABLED', 'true')
    vi.doMock('@sentry/vue', () => ({
      captureException: vi.fn(() => { throw new Error('capture failed') }),
      captureMessage: vi.fn(() => { throw new Error('message failed') }),
      setUser: vi.fn(() => { throw new Error('user failed') }),
      addBreadcrumb: vi.fn(() => { throw new Error('breadcrumb failed') }),
    }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sentry = await import('@/utils/sentry')

    sentry.captureException(new Error('boom'))
    sentry.captureMessage('hello')
    sentry.setSentryUser({ id: 1 })
    sentry.addSentryBreadcrumb({ category: 'test' })
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(4))
  })

  it('allows a later call to retry after a failed chunk load', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
    vi.stubEnv('VITE_SENTRY_ENABLED', 'true')
    let attempts = 0
    vi.doMock('@sentry/vue', () => {
      attempts += 1
      if (attempts === 1) return Promise.reject(new Error('temporary failure'))
      return { captureMessage: vi.fn() }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { captureMessage } = await import('@/utils/sentry')

    captureMessage('first')
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1))
    captureMessage('second')
    await vi.waitFor(() => expect(attempts).toBe(2))
  })

  it('initializes the SDK before reporting after the first initialization import failed', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
    let attempts = 0
    const init = vi.fn()
    const captureMessage = vi.fn()
    vi.doMock('@sentry/vue', () => {
      attempts += 1
      if (attempts === 1) return Promise.reject(new Error('temporary chunk failure'))
      return {
        init,
        captureMessage,
        browserTracingIntegration: vi.fn(),
        replayIntegration: vi.fn(),
      }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sentry = await import('@/utils/sentry')
    const app = {} as never
    const router = {} as never
    sentry.initSentry(app, router)
    await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce())

    sentry.captureMessage('recovered')
    await vi.waitFor(() => expect(captureMessage).toHaveBeenCalledWith('recovered', 'info'))
    expect(init).toHaveBeenCalledOnce()
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ app, dsn: 'https://example.invalid/1' }))
    expect(init.mock.invocationCallOrder[0]).toBeLessThan(captureMessage.mock.invocationCallOrder[0])
  })
})
