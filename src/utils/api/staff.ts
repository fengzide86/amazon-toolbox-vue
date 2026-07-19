import { api, type ApiQueryParams } from './index'

type StaffId = string | number

export const getStaffAccounts = (params: ApiQueryParams = {}): Promise<unknown> =>
  api.get('/api/staff/accounts', params, { cache: false })

export const createStaffAccount = (payload: unknown): Promise<unknown> =>
  api.post('/api/staff/accounts', payload)

export const updateStaffAccount = (staffId: StaffId, payload: unknown): Promise<unknown> =>
  api.patch(`/api/staff/accounts/${encodeURIComponent(staffId)}`, payload)

export const resetStaffPassword = (staffId: StaffId, newPassword: string): Promise<unknown> =>
  api.post(`/api/staff/accounts/${encodeURIComponent(staffId)}/reset-password`, { new_password: newPassword })

export const changeStaffPassword = (currentPassword: string, newPassword: string): Promise<unknown> =>
  api.post('/api/staff/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })

export const logoutStaff = (): Promise<unknown> => api.post('/api/staff/auth/logout', {})
