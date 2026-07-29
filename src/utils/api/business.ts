import { api } from './index'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type QueryParams = Record<string, string | number | boolean | null | undefined>
type Schemas = components['schemas']
type BusinessBootstrap = Schemas['BusinessBootstrapResponse']
type BusinessBatch = Schemas['BusinessBatchResponse']
type BusinessBatchEnvelope = Schemas['APIResponse_BusinessBatchResponse_']
type BusinessBatchItemEnvelope = Schemas['APIResponse_BusinessBatchItemResponse_']

export const getBusinessBootstrap = (): Promise<BusinessBootstrap> => api.get('/api/business/bootstrap', {}, { cache: false })
export const getBusinessTools = (): Promise<Array<Record<string, unknown>>> => api.get('/api/business/tools', {}, { cache: false })
export const getBusinessBatches = (params: QueryParams = {}): Promise<BusinessBatch[]> => api.get('/api/business/batches', params, { cache: false })
export const getBusinessBatch = (batchId: EntityId): Promise<BusinessBatch> => api.get(`/api/business/batches/${batchId}`, {}, { cache: false })
export const createBusinessBatch = (payload: unknown): Promise<BusinessBatchEnvelope> => api.post('/api/business/batches', payload)
export const updateBusinessBatch = (batchId: EntityId, payload: Record<string, unknown>): Promise<BusinessBatchEnvelope> => api.patch(`/api/business/batches/${batchId}`, payload)
export const updateBusinessBatchItem = (batchId: EntityId, itemId: string, payload: Record<string, unknown>): Promise<BusinessBatchItemEnvelope> =>
  api.put(`/api/business/batches/${batchId}/items/${encodeURIComponent(itemId)}`, payload)
export const finishBusinessBatch = (batchId: EntityId, status: string): Promise<BusinessBatchEnvelope> =>
  api.post(`/api/business/batches/${batchId}/finish`, { status })
export const getAdminActionCenter = (): Promise<unknown> => api.get('/api/admin/action-center', {}, { cache: false })
export const getAdminBusinessBatch = (batchId: EntityId): Promise<unknown> => api.get(`/api/admin/business-batches/${batchId}`, {}, { cache: false })
