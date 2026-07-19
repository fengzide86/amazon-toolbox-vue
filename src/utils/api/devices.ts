import { api, request } from './index'
import { buildDeviceUnbindPath } from '@/features/admin/deviceUnbind'

type EntityId = string | number

export const getDevices = (authCodeId: EntityId | null = null): Promise<unknown> =>
  api.get('/api/devices', {
    page: 1,
    page_size: 100,
    ...(authCodeId !== null ? { auth_code_id: authCodeId } : {}),
  })
export const getMyDevices = (userId: EntityId): Promise<unknown> => api.get('/api/devices/my', { user_id: userId })
export const unbindDevice = (deviceId: EntityId, reason: string): Promise<unknown> =>
  request(buildDeviceUnbindPath(deviceId, reason), { method: 'POST' })
export const userUnbindDevice = (deviceId: EntityId, userId: EntityId): Promise<unknown> =>
  request(`/api/devices/user-unbind?device_id=${encodeURIComponent(deviceId)}&user_id=${encodeURIComponent(userId)}`, { method: 'POST' })
