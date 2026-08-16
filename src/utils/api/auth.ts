import { api } from './index'
import type { components } from '@/shared/api/openapi.generated'

type Schemas = components['schemas']
type CurrentUser = NonNullable<Schemas['CurrentUserInfoResponse']['data']>

export function verifyAuthCode(code: string, deviceId: string, deviceName: string): Promise<Schemas['VerifyResponse']> {
  const payload: Schemas['VerifyRequest'] = { code, device_id: deviceId, device_name: deviceName }
  return api.post('/api/auth/verify', payload)
}

export function adminLogin(username: string, password: string): Promise<Schemas['StaffSessionEnvelope']> {
  const payload: Schemas['StaffLogin'] = { username, password }
  return api.post('/api/staff/auth/login', payload)
}

export function checkAuthStatus(code: string, deviceId: string): Promise<Schemas['AuthStatusResponse']> {
  const payload: Schemas['VerifyRequest'] = { code, device_id: deviceId, device_name: '' }
  return api.post('/api/auth/check', payload)
}

export function getCurrentUser(): Promise<CurrentUser | null> {
  return api.get('/api/auth/me', {}, { cache: false })
}
