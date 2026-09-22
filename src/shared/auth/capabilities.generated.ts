/** Generated from backend/core/capabilities.py. Do not edit role rules here. */
export const staffCapabilities = [
  'backoffice.read', 'auth_codes.write', 'auth_codes.delete', 'business_access.write',
  'orders.write', 'plans.read', 'devices.unbind', 'profit.read', 'profit.policy.write',
  'expenses.read', 'expenses.write', 'expenses.categories.manage', 'users.write',
  'feedback.write', 'knowledge.write', 'rules.write', 'announcements.write',
  'staff.manage', 'updates.manage', 'settings.manage', 'agency.manage',
  'agency.workspace.read', 'agency.commission.read',
] as const

export type StaffCapability = typeof staffCapabilities[number]

export const staffCapabilityMatrix: Record<string, readonly StaffCapability[]> = {
  super_admin: staffCapabilities,
  operator: [
    'backoffice.read', 'auth_codes.write', 'auth_codes.delete', 'business_access.write',
    'orders.write', 'plans.read', 'devices.unbind', 'profit.read', 'expenses.read',
    'expenses.write', 'users.write', 'feedback.write', 'knowledge.write', 'rules.write',
  ],
  support: [
    'backoffice.read', 'plans.read', 'devices.unbind', 'feedback.write', 'knowledge.write',
    'rules.write', 'announcements.write',
  ],
  agent: ['agency.workspace.read', 'agency.commission.read'],
}

export function hasGeneratedStaffCapability(role: string | null | undefined, capability: StaffCapability): boolean {
  return Boolean(role && staffCapabilityMatrix[role]?.includes(capability))
}
