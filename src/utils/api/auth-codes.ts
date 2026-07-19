import { api, type ApiQueryParams } from './index'

type EntityId = string | number

export const getAuthCodes = (params: ApiQueryParams = {}): Promise<unknown> =>
  api.get('/api/auth-codes', { page: 1, page_size: 100, ...params })
export const batchGenerateAuthCodes = (data: unknown): Promise<unknown> => api.post('/api/auth-codes/batch-generate', data)
export const updateAuthCode = (id: EntityId, data: unknown): Promise<unknown> => api.put(`/api/auth-codes/${id}`, data)
export const deleteAuthCode = (id: EntityId): Promise<unknown> => api.delete(`/api/auth-codes/${id}`)
