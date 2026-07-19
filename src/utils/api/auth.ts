import { api } from './index'

export function verifyAuthCode(code: string, deviceId: string, deviceName: string): Promise<unknown> {
  return api.post('/api/auth/verify', { code, device_id: deviceId, device_name: deviceName })
}

export function adminLogin(username: string, password: string): Promise<unknown> {
  return api.post('/api/staff/auth/login', { username, password })
}

export function checkAuthStatus(code: string, deviceId: string): Promise<unknown> {
  return api.post('/api/auth/check', { code, device_id: deviceId, device_name: '' })
}

export function getCurrentUser(): Promise<unknown> {
  return api.get('/api/auth/me', {}, { cache: false })
}
