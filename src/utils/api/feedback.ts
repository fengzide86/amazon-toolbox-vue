import { api, type ApiQueryParams } from './index'

type EntityId = string | number

export const getFeedbacks = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/feedback', params)
export const getMyFeedbacks = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/feedback/my', params)
export const createFeedback = (data: unknown): Promise<unknown> => api.post('/api/feedback', data)
export const updateFeedback = (id: EntityId, data: unknown): Promise<unknown> => api.put(`/api/feedback/${id}`, data)
