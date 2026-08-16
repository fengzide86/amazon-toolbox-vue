import { api, type ApiQueryParams } from './index'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type Schemas = components['schemas']

export const getAuthCodes = (params: ApiQueryParams = {}): Promise<Schemas['AuthCodeResponse'][]> =>
  api.get('/api/auth-codes', { page: 1, page_size: 100, ...params })
export const batchGenerateAuthCodes = (data: Schemas['AuthCodeGenerate']): Promise<Schemas['AuthCodeBatchGenerateResponse']> =>
  api.post('/api/auth-codes/batch-generate', data)
export const updateAuthCode = (id: EntityId, data: Schemas['AuthCodeUpdate']): Promise<Schemas['AuthCodeResponse']> =>
  api.put(`/api/auth-codes/${encodeURIComponent(String(id))}`, data)
export const deleteAuthCode = (id: EntityId): Promise<Schemas['AuthCodeDeleteResponse']> =>
  api.delete(`/api/auth-codes/${encodeURIComponent(String(id))}`)
