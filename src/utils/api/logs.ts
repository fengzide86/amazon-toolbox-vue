import { api, type ApiQueryParams } from './index'
import type { components } from '@/shared/api/openapi.generated'
import { downloadApiFile } from './download'

type EntityId = string | number
type Schemas = components['schemas']
type LogResponse = Schemas['LogResponse']

export const getLogs = (userIdOrParams: number | ApiQueryParams = {}): Promise<LogResponse[]> =>
  api.get('/api/logs', {
    page: 1,
    page_size: 100,
    ...(typeof userIdOrParams === 'number' ? { user_id: userIdOrParams } : userIdOrParams),
  })

export async function exportLogs(params: ApiQueryParams = {}): Promise<Blob> {
  return downloadApiFile('/api/logs/export', params)
}

export const getLogTools = (userId: EntityId | null = null): Promise<string[]> =>
  api.get('/api/logs/tools', userId !== null ? { user_id: userId } : {})
export const createLog = (data: Schemas['LogCreate']): Promise<LogResponse> =>
  api.post('/api/logs', data)
