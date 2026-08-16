import { api, type ApiQueryParams } from './index'
import type { components } from '@/shared/api/openapi.generated'

type ExecutionResponse = components['schemas']['ExecutionResponse']

export const getExecutions = (params: ApiQueryParams = {}): Promise<ExecutionResponse[]> =>
  api.get('/api/executions', params, { cache: false })

export const getExecution = (executionId: string | number): Promise<ExecutionResponse> =>
  api.get(`/api/executions/${encodeURIComponent(executionId)}`, {}, { cache: false })
