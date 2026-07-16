import { api, API_BASE, type ApiQueryParams } from './index'
import { authService } from '../auth'
import { toolboxVersionHeaders } from '@/shared/api/client-metadata'

type EntityId = string | number

function queryString(params: ApiQueryParams): string {
  return new URLSearchParams(
    Object.entries(params)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString()
}

export const getLogs = (userIdOrParams: number | ApiQueryParams = {}): Promise<unknown> =>
  api.get('/api/logs', typeof userIdOrParams === 'number' ? { user_id: userIdOrParams } : userIdOrParams)

export async function exportLogs(params: ApiQueryParams = {}): Promise<Blob> {
  const query = queryString(params)
  const token = authService.getAuth()?.token || localStorage.getItem('toolbox_token')
  const headers = toolboxVersionHeaders(token ? { Authorization: `Bearer ${token}` } : {})
  const response = await fetch(`${API_BASE}/api/logs/export${query ? `?${query}` : ''}`, { headers })
  return response.blob()
}

export const getLogTools = (userId: EntityId | null = null): Promise<unknown> =>
  api.get('/api/logs/tools', userId !== null ? { user_id: userId } : {})
export const createLog = (data: unknown): Promise<unknown> => api.post('/api/logs', data)
