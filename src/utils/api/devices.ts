import { api, request } from './index'

type EntityId = string | number

export const getDevices = (authCodeId: EntityId | null = null): Promise<unknown> =>
  api.get('/api/devices', authCodeId !== null ? { auth_code_id: authCodeId } : {})
export const getMyDevices = (userId: EntityId): Promise<unknown> => api.get('/api/devices/my', { user_id: userId })
export const unbindDevice = (deviceId: string): Promise<unknown> =>
  request(`/api/devices/unbind?device_id=${encodeURIComponent(deviceId)}`, { method: 'POST' })
export const userUnbindDevice = (deviceId: string, userId: EntityId): Promise<unknown> =>
  request(`/api/devices/user-unbind?device_id=${encodeURIComponent(deviceId)}&user_id=${encodeURIComponent(userId)}`, { method: 'POST' })
