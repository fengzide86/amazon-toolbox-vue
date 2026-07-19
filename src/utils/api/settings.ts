import { api } from './index'

export const getSettings = (): Promise<unknown> => api.get('/api/settings')
export const getPublicSettings = (): Promise<unknown> => api.get('/api/settings/public', {}, { cache: false })
export const updateSetting = (data: unknown): Promise<unknown> => api.put('/api/settings', data)
