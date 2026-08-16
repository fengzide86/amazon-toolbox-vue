import { api } from './index'
import type { components } from '@/shared/api/openapi.generated'

type ToolId = string | number
type QueryValue = string | number | boolean | null | undefined
type Schemas = components['schemas']
type JsonValue = Schemas['JsonValue']
type ConfigJsonValue = Schemas['ConfigJsonValue']

export interface ToolLaunchGrantOptions {
  platformKey?: string
  deviceId?: string
  executionMode?: 'single' | 'batch'
  clientBatchId?: string
  clientItemId?: string
  idempotencyKey?: string
}

export type ToolLaunchGrantResult = Schemas['LaunchGrantDataResponse']

export const getTools = (params: Record<string, QueryValue> = {}): Promise<ConfigJsonValue[]> => api.get('/api/tools', params)
export const getToolCategories = (): Promise<ConfigJsonValue[]> => api.get('/api/tools/categories')
export const updateTools = (tools: Array<Record<string, JsonValue>>): Promise<Schemas['ToolConfigUpdateResponse']> =>
  api.put('/api/tools', tools)
export const updateToolCategories = (categories: JsonValue[]): Promise<Schemas['ConfigUpdateResponse']> =>
  api.put('/api/tools/categories', categories)

export async function createToolLaunchGrant(
  toolId: ToolId,
  {
    platformKey,
    deviceId,
    executionMode = 'single',
    clientBatchId,
    clientItemId,
    idempotencyKey,
  }: ToolLaunchGrantOptions = {},
): Promise<ToolLaunchGrantResult> {
  const params = new URLSearchParams({ platform_key: platformKey || '' })
  const payload: Record<string, unknown> = { platform_key: platformKey, device_id: deviceId }
  if (executionMode === 'batch') {
    params.set('execution_mode', 'batch')
    payload.execution_mode = 'batch'
  }
  if (clientBatchId) params.set('client_batch_id', clientBatchId)
  if (clientItemId) params.set('client_item_id', clientItemId)
  if (idempotencyKey) params.set('idempotency_key', idempotencyKey)

  const response = await api.post<Schemas['LaunchGrantSuccessResponse'] | Schemas['ToolOperationErrorResponse']>(
    `/api/tools/${encodeURIComponent(toolId)}/launch-grant?${params}`,
    payload,
  )
  if (response.success === false) {
    const error = new Error(response.message || '工具启动失败') as Error & {
      code?: number
      data?: JsonValue
    }
    error.code = response.error_code
    error.data = response.detail
    throw error
  }
  return response.data
}
