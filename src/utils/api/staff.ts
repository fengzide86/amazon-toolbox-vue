import { api, type ApiQueryParams } from './index'
import type { components } from '@/shared/api/openapi.generated'

type StaffId = string | number
type Schemas = components['schemas']

export const getStaffAccounts = (params: ApiQueryParams = {}): Promise<Schemas['StaffAccountResponse'][]> =>
  api.get('/api/staff/accounts', params, { cache: false })

export const createStaffAccount = (payload: Schemas['StaffAccountCreate']): Promise<Schemas['StaffAccountEnvelope']> =>
  api.post('/api/staff/accounts', payload)

export const updateStaffAccount = (staffId: StaffId, payload: Schemas['StaffAccountUpdate']): Promise<Schemas['StaffAccountResponse']> =>
  api.patch(`/api/staff/accounts/${encodeURIComponent(String(staffId))}`, payload)

export const resetStaffPassword = (staffId: StaffId, newPassword: string): Promise<Schemas['StaffOperationEnvelope']> => {
  const payload: Schemas['StaffPasswordReset'] = { new_password: newPassword }
  return api.post(`/api/staff/accounts/${encodeURIComponent(String(staffId))}/reset-password`, payload)
}

export const changeStaffPassword = (currentPassword: string, newPassword: string): Promise<Schemas['StaffSessionEnvelope']> => {
  const payload: Schemas['StaffPasswordChange'] = {
    current_password: currentPassword,
    new_password: newPassword,
  }
  return api.post('/api/staff/auth/change-password', payload)
}

export const logoutStaff = (): Promise<Schemas['StaffOperationEnvelope']> => api.post('/api/staff/auth/logout', {})
