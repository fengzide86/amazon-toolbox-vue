import { api } from './index.js'

export const getBusinessBootstrap = () => api.get('/api/business/bootstrap', {}, { cache: false })
export const getBusinessTools = () => api.get('/api/business/tools', {}, { cache: false })
export const getBusinessBatches = (params = {}) => api.get('/api/business/batches', params, { cache: false })
export const getBusinessBatch = (batchId) => api.get(`/api/business/batches/${batchId}`, {}, { cache: false })
export const createBusinessBatch = (payload) => api.post('/api/business/batches', payload)
export const updateBusinessBatch = (batchId, payload) => api.patch(`/api/business/batches/${batchId}`, payload)
export const updateBusinessBatchItem = (batchId, itemId, payload) => api.put(`/api/business/batches/${batchId}/items/${encodeURIComponent(itemId)}`, payload)
export const finishBusinessBatch = (batchId, status) => api.post(`/api/business/batches/${batchId}/finish`, { status })

export const getAdminActionCenter = () => api.get('/api/admin/action-center', {}, { cache: false })
export const getAdminBusinessBatch = (batchId) => api.get(`/api/admin/business-batches/${batchId}`, {}, { cache: false })
