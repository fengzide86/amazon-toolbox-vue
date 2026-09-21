import { parseStoredUser, type AuthenticatedUser } from './model'

/** Profile and token share the current tab. Legacy profiles are read only when
 * their JWT identity matches; this is a display consistency check, not auth. */
export function readSessionUser(): AuthenticatedUser | null {
  const current = parseStoredUser(sessionStorage.getItem('toolbox_user'))
  if (current) return current
  const legacy = parseStoredUser(localStorage.getItem('toolbox_user'))
  if (!legacy) return null
  let token = sessionStorage.getItem('toolbox_token')
  if (!token) {
    try { token = (JSON.parse(sessionStorage.getItem('toolbox_auth') || '{}') as { token?: string }).token ?? null }
    catch { /* Pre-token versions stored an authorization code here. */ }
  }
  if (token?.split('.').length === 3) {
    try {
      const payload = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
      const claims = JSON.parse(atob(payload)) as Record<string, unknown>
      const key = claims.staff_id !== undefined ? 'staff_id' : 'user_id'
      const expected = claims[key]
      const actual = legacy[key] ?? legacy.id
      if (expected === undefined || actual === undefined || String(expected) !== String(actual)) return null
      if (legacy.role && claims.role && legacy.role !== claims.role) return null
      if (claims.auth_code_id !== undefined && legacy.auth_code_id !== undefined
        && String(claims.auth_code_id) !== String(legacy.auth_code_id)) return null
      if (claims.device_id && legacy.device_id && claims.device_id !== legacy.device_id) return null
    } catch { return null }
  }
  return legacy
}
