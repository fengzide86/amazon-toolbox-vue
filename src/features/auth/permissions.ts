import type { AuthRole } from './model'
import { isBackofficeRole } from './model'
import { hasGeneratedStaffCapability, type StaffCapability } from '@/shared/auth/capabilities.generated'

export type StaffPermission = StaffCapability

export function hasStaffPermission(role: AuthRole | null | undefined, permission: StaffPermission): boolean {
  return isBackofficeRole(role) && hasGeneratedStaffCapability(role, permission)
}

export function staffRoleLabel(role: AuthRole | null | undefined): string {
  if (role === 'super_admin') return '超级管理员'
  if (role === 'operator') return '运营'
  if (role === 'support') return '客服'
  if (role === 'agent') return '代理运营'
  return '用户'
}
