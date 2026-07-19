import { api, type ApiQueryParams } from './index'

export const getExecutions = (params: ApiQueryParams = {}): Promise<unknown> =>
  api.get('/api/executions', params, { cache: false })

export const getExecution = (executionId: string | number): Promise<unknown> =>
  api.get(`/api/executions/${encodeURIComponent(executionId)}`, {}, { cache: false })
