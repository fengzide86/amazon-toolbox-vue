import { api, type ApiQueryParams } from './index'

type EntityId = string | number

export const getPlans = (): Promise<unknown> => api.get('/api/plans')
export const getPlansAdmin = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/plans/admin', params, { cache: false })
export const createPlan = (data: unknown): Promise<unknown> => api.post('/api/plans', data)
export const updatePlan = (id: EntityId, data: unknown): Promise<unknown> => api.patch(`/api/plans/${encodeURIComponent(String(id))}`, data)
export const enablePlan = (id: EntityId): Promise<unknown> => api.post(`/api/plans/${encodeURIComponent(String(id))}/enable`)
export const disablePlan = (id: EntityId): Promise<unknown> => api.post(`/api/plans/${encodeURIComponent(String(id))}/disable`)
export const archivePlan = (id: EntityId): Promise<unknown> => api.post(`/api/plans/${encodeURIComponent(String(id))}/archive`)
