import { api, request } from './index'
import { buildDeviceUnbindPath } from '@/features/admin/deviceUnbind'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type Schemas = components['schemas']
type AdminDeviceList = Schemas['AdminDevicePageResponse']['data']
type UserDeviceList = Array<Schemas['domains__access__device_schemas__UserDeviceResponse']>

export const getDevices = (authCodeId: EntityId | null = null): Promise<AdminDeviceList> =>
  api.get('/api/devices', {
    page: 1,
    page_size: 100,
    ...(authCodeId !== null ? { auth_code_id: authCodeId } : {}),
  })
export const getMyDevices = (userId: EntityId): Promise<UserDeviceList> => api.get('/api/devices/my', { user_id: userId })
export const unbindDevice = (deviceId: EntityId, reason: string): Promise<Schemas['DeviceUnbindResponse']> =>
  request(buildDeviceUnbindPath(deviceId, reason), { method: 'POST' })
export const userUnbindDevice = (deviceId: EntityId, userId: EntityId): Promise<Schemas['DeviceUnbindResponse']> =>
  request(`/api/devices/user-unbind?device_id=${encodeURIComponent(deviceId)}&user_id=${encodeURIComponent(userId)}`, { method: 'POST' })
