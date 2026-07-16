import { api } from './index'

type ToolId = string | number
type QueryValue = string | number | boolean | null | undefined

export interface ToolLaunchGrantOptions {
  platformKey?: string
  deviceId?: string
  executionMode?: 'single' | 'batch'
  clientBatchId?: string
  clientItemId?: string
  idempotencyKey?: string
}

export interface ToolLaunchGrantResult extends Record<string, unknown> {
  launch_data?: { token?: string; script_key?: string; [key: string]: unknown }
}

export const getTools = (params: Record<string, QueryValue> = {}): Promise<unknown> => api.get('/api/tools', params)
export const getToolCategories = (): Promise<unknown> => api.get('/api/tools/categories')
export const updateTools = (tools: unknown): Promise<unknown> => api.put('/api/tools', tools)
export const updateToolCategories = (categories: unknown): Promise<unknown> => api.put('/api/tools/categories', categories)

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

  const response = await api.post(`/api/tools/${encodeURIComponent(toolId)}/launch-grant?${params}`, payload)
  if (typeof response !== 'object' || response === null) throw new Error('工具启动响应格式无效')
  const record = response as Record<string, unknown>
  if (record.success === false) {
    const error = new Error(typeof record.message === 'string' ? record.message : '工具启动失败') as Error & {
      code?: unknown
      data?: unknown
    }
    error.code = record.error_code
    error.data = record.detail
    throw error
  }
  const result = record.data ?? response
  if (typeof result !== 'object' || result === null) throw new Error('工具启动数据格式无效')
  return result as ToolLaunchGrantResult
}
