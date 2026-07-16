import { api } from './index'

type EntityId = string | number
type QueryParams = Record<string, string | number | boolean | null | undefined>

export const getBusinessBootstrap = (): Promise<unknown> => api.get('/api/business/bootstrap', {}, { cache: false })
export const getBusinessTools = (): Promise<unknown> => api.get('/api/business/tools', {}, { cache: false })
export const getBusinessBatches = (params: QueryParams = {}): Promise<unknown> => api.get('/api/business/batches', params, { cache: false })
export const getBusinessBatch = (batchId: EntityId): Promise<unknown> => api.get(`/api/business/batches/${batchId}`, {}, { cache: false })
export const createBusinessBatch = (payload: unknown): Promise<unknown> => api.post('/api/business/batches', payload)
export const updateBusinessBatch = (batchId: EntityId, payload: unknown): Promise<unknown> => api.patch(`/api/business/batches/${batchId}`, payload)
export const updateBusinessBatchItem = (batchId: EntityId, itemId: string, payload: unknown): Promise<unknown> =>
  api.put(`/api/business/batches/${batchId}/items/${encodeURIComponent(itemId)}`, payload)
export const finishBusinessBatch = (batchId: EntityId, status: string): Promise<unknown> =>
  api.post(`/api/business/batches/${batchId}/finish`, { status })
export const getAdminActionCenter = (): Promise<unknown> => api.get('/api/admin/action-center', {}, { cache: false })
export const getAdminBusinessBatch = (batchId: EntityId): Promise<unknown> => api.get(`/api/admin/business-batches/${batchId}`, {}, { cache: false })
