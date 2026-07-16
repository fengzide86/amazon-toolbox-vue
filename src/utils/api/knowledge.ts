import { api, type ApiQueryParams } from './index'

type EntityId = string | number

export const getKnowledgeList = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/knowledge', params)
export const getKnowledgeCategories = (): Promise<unknown> => api.get('/api/knowledge/categories')
export const getKnowledgeStats = (): Promise<unknown> => api.get('/api/knowledge/stats')
export const getKnowledge = (id: EntityId): Promise<unknown> => api.get(`/api/knowledge/${id}`)
export const createKnowledge = (data: unknown): Promise<unknown> => api.post('/api/knowledge', data)
export const updateKnowledge = (id: EntityId, data: unknown): Promise<unknown> => api.put(`/api/knowledge/${id}`, data)
export const deleteKnowledge = (id: EntityId): Promise<unknown> => api.delete(`/api/knowledge/${id}`)
export const batchImportKnowledge = (items: unknown): Promise<unknown> => api.post('/api/knowledge/batch-import', items)
export const syncKnowledgeVector = (): Promise<unknown> => api.post('/api/knowledge/sync-vector')
export const testKnowledgeRetrieval = (data: unknown): Promise<unknown> => api.post('/api/knowledge/retrieval-test', data)
