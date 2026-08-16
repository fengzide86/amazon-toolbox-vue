import { api } from './index'
import type { components } from '@/shared/api/openapi.generated'

type Schemas = components['schemas']

export const getSettings = (): Promise<Schemas['SettingResponse'][]> => api.get('/api/settings')
export const getPublicSettings = (): Promise<Schemas['SettingResponse'][]> => api.get('/api/settings/public', {}, { cache: false })
export const updateSetting = (data: Schemas['SettingUpdate']): Promise<Schemas['SettingUpdateResponse']> =>
  api.put('/api/settings', data)
