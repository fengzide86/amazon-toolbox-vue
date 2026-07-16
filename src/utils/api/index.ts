import { generateCacheKey, getCache, setCache } from '../cache'
import { authService } from '../auth'

const CACHE_ENABLED = true
const CACHE_TTL = 5 * 60 * 1000
const CACHE_PATTERNS = [
  /\/api\/plans$/,
  /\/api\/tools$/,
  /\/api\/tools\/categories$/,
  /\/api\/settings$/,
  /\/api\/logs\/tools/,
]

export type ApiQueryValue = string | number | boolean | null | undefined
export type ApiQueryParams = Record<string, ApiQueryValue>
type ApiBody = unknown

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: ApiBody
  headers?: HeadersInit
}

export interface ApiGetOptions {
  cache?: boolean
}

function shouldCache(url: string): boolean {
  return CACHE_ENABLED && CACHE_PATTERNS.some(pattern => pattern.test(url))
}

function getApiBase(): string {
  try {
    const runtimeApiBase = window.electronAPI?.runtime?.controlApiBase
    if (runtimeApiBase) return runtimeApiBase
  } catch {
    // 非 Electron 环境继续使用存储或构建配置。
  }
  try {
    const controlApiBase = localStorage.getItem('toolbox_control_api_base')
    if (controlApiBase) return controlApiBase
    const electronApiBase = localStorage.getItem('toolbox_api_base')
    if (electronApiBase) return electronApiBase
  } catch {
    // 存储不可用时继续使用构建配置。
  }
  return import.meta.env.VITE_CONTROL_API_BASE || import.meta.env.VITE_API_BASE || 'http://localhost:8000'
}

export const API_BASE = getApiBase()
const pendingRequests = new Map<string, Promise<unknown>>()
const MAX_RETRIES = 3
const RETRY_DELAY = 2000

export class ApiError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(message: string, status = 0, data: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

const delay = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds))

function getAuthToken(): string | null {
  try {
    return authService.getAuth()?.token
      || sessionStorage.getItem('toolbox_token')
      || localStorage.getItem('toolbox_token')
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function unwrapData(value: unknown): unknown {
  const record = asRecord(value)
  return record && record.data !== undefined ? record.data : value
}

function errorMessage(value: unknown, fallback: string): string {
  const record = asRecord(value)
  if (typeof record?.detail === 'string') return record.detail
  if (typeof record?.message === 'string') return record.message
  return fallback
}

function createRequestInit(options: ApiRequestOptions, token: string | null): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => {
      const existing = Object.keys(headers).find(header => header.toLowerCase() === key.toLowerCase())
      if (existing) delete headers[existing]
      headers[key] = value
    })
  }

  let body: BodyInit | undefined
  if (options.body !== undefined && options.body !== null) {
    if (options.body instanceof FormData) {
      body = options.body
      delete headers['Content-Type']
    } else {
      body = JSON.stringify(options.body)
    }
  }

  return { ...options, headers, body }
}

export async function request<T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const isIdempotent = method === 'GET'
  const key = `${method}:${url}`
  const existing = isIdempotent ? pendingRequests.get(key) : undefined
  if (existing) return existing as Promise<T>

  const config = createRequestInit(options, getAuthToken())
  const fetchPromise = (async (): Promise<unknown> => {
    let lastError: unknown = new ApiError('请求失败')
    const maxAttempts = isIdempotent ? MAX_RETRIES + 1 : 1
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      try {
        const controller = new AbortController()
        timeoutId = setTimeout(() => controller.abort(), 10000)
        const response = await fetch(`${getApiBase()}${url}`, { ...config, signal: controller.signal })

        let data: unknown
        try {
          data = await response.json()
        } catch {
          throw new ApiError(`服务器返回非 JSON 响应: ${response.status}`, response.status)
        }

        if (!response.ok) {
          const record = asRecord(data)
          const errorCode = typeof record?.error_code === 'number' ? record.error_code : null
          const authInvalidCodes = new Set([2000, 2001, 2002, 3000, 3001, 3002])
          const shouldClearAuth = response.status === 401
            || (response.status === 403 && errorCode !== null && authInvalidCodes.has(errorCode))
          if (shouldClearAuth && authService.getAuth()) {
            const role = authService.getRole()
            authService.clear()
            if (!window.location.hash.includes('/login')) {
              window.location.hash = role === 'admin' ? '#/admin/login' : '#/user/login'
            }
          }
          throw new ApiError(errorMessage(data, `请求失败: ${response.status}`), response.status, data)
        }
        return data
      } catch (error) {
        lastError = error
        console.error(`API Error (attempt ${attempt + 1}/${maxAttempts}): ${url}`, error)
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error
        if (attempt < maxAttempts - 1) await delay(RETRY_DELAY)
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
      }
    }
    throw lastError
  })()

  if (isIdempotent) {
    pendingRequests.set(key, fetchPromise)
    const cleanup = (): void => { pendingRequests.delete(key) }
    void fetchPromise.then(cleanup, cleanup)
  }
  return fetchPromise as Promise<T>
}

export function clearApiCache(url: string): void {
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('toolbox_cache_') && key.includes(url)) localStorage.removeItem(key)
  })
}

function invalidationPrefix(url: string): string {
  return url.split('/').slice(0, 3).join('/')
}

export const api = {
  async get<T = unknown>(url: string, params: ApiQueryParams = {}, options: ApiGetOptions = {}): Promise<T> {
    const entries = Object.entries(params)
      .filter((entry): entry is [string, Exclude<ApiQueryValue, null | undefined>] => entry[1] !== null && entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)] as [string, string])
    const queryString = new URLSearchParams(entries).toString()
    const fullUrl = queryString ? `${url}?${queryString}` : url

    if (options.cache !== false && shouldCache(url)) {
      const cacheKey = generateCacheKey(fullUrl)
      const cached = getCache<T>(cacheKey)
      if (cached !== null) return cached
      const response = await request(fullUrl, { method: 'GET' })
      const result = unwrapData(response) as T
      setCache(cacheKey, result, CACHE_TTL)
      return result
    }
    return unwrapData(await request(fullUrl, { method: 'GET' })) as T
  },

  async post<T = unknown>(url: string, data: ApiBody = {}): Promise<T> {
    const result = await request<T>(url, { method: 'POST', body: data })
    clearApiCache(invalidationPrefix(url))
    return result
  },

  async put<T = unknown>(url: string, data: ApiBody = {}): Promise<T> {
    const result = await request<T>(url, { method: 'PUT', body: data })
    clearApiCache(invalidationPrefix(url))
    return result
  },

  async patch<T = unknown>(url: string, data: ApiBody = {}): Promise<T> {
    const result = await request(url, { method: 'PATCH', body: data })
    clearApiCache(invalidationPrefix(url))
    return unwrapData(result) as T
  },

  async delete<T = unknown>(url: string): Promise<T> {
    const result = await request<T>(url, { method: 'DELETE' })
    clearApiCache(invalidationPrefix(url))
    return result
  },
}

export { verifyAuthCode, adminLogin, checkAuthStatus, getCurrentUser } from './auth'
export { getAuthCodes, batchGenerateAuthCodes, updateAuthCode, deleteAuthCode } from './auth-codes'
export { getPlans, getPlansAdmin } from './plans'
export { getOrders, exportOrders, createOrder, updateOrder, refundOrder } from './orders'
export { getUsers, updateUser } from './users'
export { getDevices, getMyDevices, unbindDevice, userUnbindDevice } from './devices'
export { getKnowledgeList, getKnowledgeCategories, getKnowledgeStats, getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge, batchImportKnowledge, syncKnowledgeVector, testKnowledgeRetrieval } from './knowledge'
export { createChatSession, getChatSession, sendChatMessage, resolveChatSession, transferChatToHuman, rateChatSession, getChatHistory, getAIChatConfig, updateAIChatConfig, getAdminChatSessions, getAdminChatSession, getAIChatStats, debugAIChat } from './ai-chat'
export { getAnnouncements, getAnnouncementFeed, markAnnouncementRead, dismissAnnouncement, createAnnouncement, updateAnnouncement, deleteAnnouncement } from './announcements'
export { getTools, getToolCategories, updateTools, updateToolCategories, createToolLaunchGrant } from './tools'
export { getToolReleases, createToolRelease, publishToolRelease, rollbackToolRelease } from './tool-releases'
export { getFeedbacks, getMyFeedbacks, createFeedback, updateFeedback } from './feedback'
export { getLogs, exportLogs, getLogTools, createLog } from './logs'
export { getDashboard, getDashboardCharts, getProfit, getProfitSummary } from './dashboard'
export { getBusinessBootstrap, getBusinessTools, getBusinessBatches, getBusinessBatch, createBusinessBatch, updateBusinessBatch, updateBusinessBatchItem, finishBusinessBatch, getAdminActionCenter, getAdminBusinessBatch } from './business'
export { getSettings, updateSetting } from './settings'
