/**
 * Sentry 错误监控配置
 * 
 * 用于捕获前端异常并上报到 Sentry
 * 
 * 使用前需要：
 * 1. 在 Sentry 创建项目获取 DSN
 * 2. 将 DSN 填入环境变量 VITE_SENTRY_DSN
 * 
 * 注意：默认只在生产环境启用，开发环境不会上报错误
 */
import * as Sentry from '@sentry/vue'

/**
 * 初始化 Sentry
 * @param {Object} app - Vue 应用实例
 * @param {Object} router - Vue Router 实例
 */
export function initSentry(app, router) {
  // 获取 DSN，优先使用环境变量
  const dsn = import.meta.env.VITE_SENTRY_DSN
  
  // 如果没有配置 DSN，跳过初始化
  if (!dsn) {
    console.log('[Sentry] 未配置 DSN，错误监控未启用')
    return
  }
  
  // 判断是否启用 Sentry（生产环境默认启用，开发环境可通过环境变量开启）
  const isEnabled = import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true'
  
  if (!isEnabled) {
    console.log('[Sentry] 当前环境未启用错误监控')
    return
  }
  
  try {
    Sentry.init({
      app,
      dsn,
      
      // 性能监控
      integrations: [
        Sentry.browserTracingIntegration({ router }),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      
      // 性能追踪采样率
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      
      // Session Replay 采样率
      replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 0,
      replaysOnErrorSampleRate: 1.0,
      
      // 环境标识
      environment: import.meta.env.MODE || 'development',
      
      // 发布版本
      release: `amazon-toolbox@${import.meta.env.PACKAGE_VERSION || '1.0.0'}`,
      
      // 忽略某些错误
      ignoreErrors: [
        // 网络错误（通常是用户网络问题）
        'Failed to fetch',
        'NetworkError',
        // 用户取消操作
        'AbortError',
        // 第三方脚本错误
        'Script error',
      ],
      
      //  beforeSend 钩子：可以在发送前修改或丢弃事件
      beforeSend(event) {
        // 可以在这里过滤敏感信息
        // 例如：移除用户密码等
        return event
      },
    })
    
    console.log('[Sentry] 错误监控已初始化')
  } catch (error) {
    console.error('[Sentry] 初始化失败:', error)
  }
}

/**
 * 手动捕获异常
 * @param {Error} error - 错误对象
 * @param {Object} context - 额外上下文信息
 */
export function captureException(error, context = {}) {
  if (import.meta.env.PROD) {
    Sentry.captureException(error, { contexts: { custom: context } })
  } else {
    console.error('[Sentry] 捕获异常:', error, context)
  }
}

/**
 * 手动捕获消息
 * @param {string} message - 消息内容
 * @param {string} level - 级别: 'info' | 'warning' | 'error'
 */
export function captureMessage(message, level = 'info') {
  if (import.meta.env.PROD) {
    Sentry.captureMessage(message, level)
  } else {
    console.log(`[Sentry] ${level}:`, message)
  }
}

/**
 * 设置用户信息
 * @param {Object} user - 用户信息
 */
export function setSentryUser(user) {
  if (user) {
    Sentry.setUser({
      id: user.id,
      username: user.name,
      // 不要上报敏感信息如手机号
    })
  } else {
    Sentry.setUser(null)
  }
}

/**
 * 添加面包屑
 * @param {Object} breadcrumb - 面包屑信息
 */
export function addSentryBreadcrumb(breadcrumb) {
  Sentry.addBreadcrumb(breadcrumb)
}