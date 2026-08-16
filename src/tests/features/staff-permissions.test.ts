import { describe, expect, it } from 'vitest'

import { hasStaffPermission } from '@/features/auth/permissions'

describe('fixed staff permission matrix', () => {
  it('gives super admins account, settings and update control', () => {
    expect(hasStaffPermission('super_admin', 'staff.manage')).toBe(true)
    expect(hasStaffPermission('super_admin', 'settings.manage')).toBe(true)
    expect(hasStaffPermission('super_admin', 'updates.manage')).toBe(true)
    expect(hasStaffPermission('super_admin', 'profit.policy.write')).toBe(true)
    expect(hasStaffPermission('super_admin', 'plans.read')).toBe(true)
    expect(hasStaffPermission('super_admin', 'devices.unbind')).toBe(true)
    expect(hasStaffPermission('super_admin', 'expenses.categories.manage')).toBe(true)
  })

  it('allows operators commerce work but not super-admin settings', () => {
    expect(hasStaffPermission('operator', 'orders.write')).toBe(true)
    expect(hasStaffPermission('operator', 'profit.read')).toBe(true)
    expect(hasStaffPermission('operator', 'profit.policy.write')).toBe(false)
    expect(hasStaffPermission('operator', 'settings.manage')).toBe(false)
    expect(hasStaffPermission('operator', 'plans.read')).toBe(true)
    expect(hasStaffPermission('operator', 'auth_codes.delete')).toBe(true)
    expect(hasStaffPermission('operator', 'devices.unbind')).toBe(true)
    expect(hasStaffPermission('operator', 'users.write')).toBe(true)
    expect(hasStaffPermission('operator', 'expenses.write')).toBe(true)
    expect(hasStaffPermission('operator', 'expenses.categories.manage')).toBe(false)
  })

  it('allows support to maintain rule-based customer service and announcements', () => {
    expect(hasStaffPermission('support', 'rules.write')).toBe(true)
    expect(hasStaffPermission('support', 'announcements.write')).toBe(true)
    expect(hasStaffPermission('support', 'orders.write')).toBe(false)
    expect(hasStaffPermission('support', 'profit.read')).toBe(false)
    expect(hasStaffPermission('support', 'profit.policy.write')).toBe(false)
    expect(hasStaffPermission('support', 'plans.read')).toBe(true)
    expect(hasStaffPermission('support', 'devices.unbind')).toBe(true)
    expect(hasStaffPermission('support', 'auth_codes.delete')).toBe(false)
    expect(hasStaffPermission('support', 'users.write')).toBe(false)
    expect(hasStaffPermission('support', 'expenses.read')).toBe(false)
  })
})
