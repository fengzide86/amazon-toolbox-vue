const ERROR_MESSAGES: Record<string, string> = {
  'Network Error': '网络连接失败，请检查网络',
  'Request failed': '请求失败，请稍后重试',
  timeout: '请求超时，请稍后重试',
  '401': '登录已过期，请重新登录',
  '403': '没有权限执行此操作',
  '404': '请求的资源不存在',
  '500': '服务器内部错误，请稍后重试',
  '502': '网关错误，请稍后重试',
  '503': '服务暂时不可用，请稍后重试',
}

export function getUserFriendlyMessage(error: Error | string | unknown): string {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(key)) return value
  }
  return message || '操作失败，请稍后重试'
}

export function handleApiError(error: unknown, context = ''): string {
  console.error(`[API Error] ${context}:`, error)
  const userMessage = getUserFriendlyMessage(error)
  void import('element-plus')
    .then(({ ElMessage }) => ElMessage.error(userMessage))
    .catch(() => console.warn(userMessage))
  return userMessage
}

export async function withErrorHandling<T>(fn: () => Promise<T>, context = ''): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    handleApiError(error, context)
    throw error
  }
}

export function logError(error: unknown, context = ''): void {
  console.error(`[Error] ${context}:`, error)
}

export class BusinessError extends Error {
  readonly code: string

  constructor(message: string, code = 'BUSINESS_ERROR') {
    super(message)
    this.name = 'BusinessError'
    this.code = code
  }
}
