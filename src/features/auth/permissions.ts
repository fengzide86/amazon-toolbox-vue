import type { AuthRole, BackofficeRole } from './model'
import { isBackofficeRole } from './model'

export type StaffPermission =
  | 'auth_codes.write'
  | 'auth_codes.delete'
  | 'business_access.write'
  | 'orders.write'
  | 'plans.read'
  | 'devices.unbind'
  | 'profit.read'
  | 'profit.policy.write'
  | 'expenses.read'
  | 'expenses.write'
  | 'expenses.categories.manage'
  | 'users.write'
  | 'feedback.write'
  | 'knowledge.write'
  | 'rules.write'
  | 'announcements.write'
  | 'staff.manage'
  | 'updates.manage'
  | 'settings.manage'

const ALL_PERMISSIONS: StaffPermission[] = [
  'auth_codes.write', 'auth_codes.delete', 'business_access.write', 'orders.write', 'plans.read', 'devices.unbind',
  'profit.read', 'profit.policy.write', 'expenses.read', 'expenses.write', 'expenses.categories.manage', 'users.write', 'feedback.write',
  'knowledge.write', 'rules.write', 'announcements.write', 'staff.manage',
  'updates.manage', 'settings.manage',
]

const ROLE_PERMISSIONS: Record<BackofficeRole, ReadonlySet<StaffPermission>> = {
  super_admin: new Set(ALL_PERMISSIONS),
  operator: new Set([
    'auth_codes.write', 'auth_codes.delete', 'business_access.write', 'orders.write', 'plans.read', 'devices.unbind', 'profit.read', 'expenses.read', 'expenses.write', 'users.write',
    'feedback.write', 'knowledge.write', 'rules.write',
  ]),
  support: new Set(['plans.read', 'devices.unbind', 'feedback.write', 'knowledge.write', 'rules.write', 'announcements.write']),
}

export function hasStaffPermission(role: AuthRole | null | undefined, permission: StaffPermission): boolean {
  return isBackofficeRole(role) && ROLE_PERMISSIONS[role].has(permission)
}

export function staffRoleLabel(role: AuthRole | null | undefined): string {
  if (role === 'super_admin') return '超级管理员'
  if (role === 'operator') return '运营'
  if (role === 'support') return '客服'
  return '用户'
}
