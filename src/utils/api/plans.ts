import { api, type ApiQueryParams } from './index'

export const getPlans = (): Promise<unknown> => api.get('/api/plans')
export const getPlansAdmin = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/plans/admin', params, { cache: false })
