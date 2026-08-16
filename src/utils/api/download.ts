import { getApiBase } from '@/shared/api/base'
import { toolboxVersionHeaders } from '@/shared/api/client-metadata'
import { authService } from '../auth'
import { ApiError, type ApiQueryParams } from './index'

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000

function queryString(params: ApiQueryParams): string {
  return new URLSearchParams(
    Object.entries(params)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString()
}

function responseMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const record = value as Record<string, unknown>
  if (typeof record.detail === 'string') return record.detail
  if (typeof record.message === 'string') return record.message
  return fallback
}

async function readErrorPayload(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') || ''
  try {
    if (contentType.includes('json')) {
      const value: unknown = await response.json()
      return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
    }
    const text = await response.text()
    return text ? { detail: text } : null
  } catch {
    return null
  }
}

export async function downloadApiFile(
  path: string,
  params: ApiQueryParams = {},
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Blob> {
  const query = queryString(params)
  const token = authService.getAuth()?.token
    || sessionStorage.getItem('toolbox_token')
    || localStorage.getItem('toolbox_token')
  const headers = toolboxVersionHeaders(token ? { Authorization: `Bearer ${token}` } : {})
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS)
  const abortFromCaller = (): void => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const response = await fetch(`${getApiBase()}${path}${query ? `?${query}` : ''}`, {
      headers,
      signal: controller.signal,
    })
    if (!response.ok) {
      const payload = await readErrorPayload(response)
      throw new ApiError(responseMessage(payload, `下载失败：HTTP ${response.status}`), {
        status: response.status,
        data: payload,
        kind: 'http',
        requestId: response.headers.get('X-Request-ID'),
        retryable: response.status >= 500,
      })
    }
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const payload = await readErrorPayload(response)
      throw new ApiError(responseMessage(payload, '下载接口返回了无效文件'), {
        status: response.status,
        data: payload,
        kind: 'parse',
        requestId: response.headers.get('X-Request-ID'),
      })
    }
    return await response.blob()
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted) {
      throw new ApiError(options.signal?.aborted ? '下载已取消' : '下载超时', {
        kind: options.signal?.aborted ? 'cancelled' : 'timeout',
        retryable: !options.signal?.aborted,
      })
    }
    throw new ApiError('网络连接失败，无法下载文件', { kind: 'network', retryable: true })
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
