import { beforeEach, describe, expect, it } from 'vitest'
import { authService } from '@/utils/auth'
import { readSessionUser } from '@/features/auth/sessionUser'
import { generateCacheKey } from '@/utils/cache'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/stores/user'
import { authenticatedUserSchema } from '@/features/auth/model'

const jwt = (claims: Record<string, unknown>): string => `header.${btoa(JSON.stringify(claims))}.signature`
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

describe('tab scoped profile consistency', () => {
  it.each(['agent', 'super_admin'] as const)('persists the real %s session shape and survives a reload with another tab legacy profile', role => {
    setActivePinia(createPinia())
    const token = jwt({ staff_id: 7, user_id: 7, role })
    const actualResponse = {
      staff_id: 7, user_id: 7, username: 'staff-7', name: '隔离代理 A', display_name: '隔离代理 A',
      role, agency_id: role === 'agent' ? 1 : null, status: 'active', token_version: 1,
      force_password_reset: false, auth_code_id: null, device_id: null, token,
    }
    useUserStore().setLogin({ token, role, auth_code: 'backoffice', user: authenticatedUserSchema.parse(actualResponse) })
    const saved = JSON.parse(sessionStorage.getItem('toolbox_user') || '{}')
    expect(saved.display_name).toBe('隔离代理 A')
    expect(saved.token).toBeUndefined()
    expect(saved.auth_code_id).toBeUndefined()
    localStorage.setItem('toolbox_user', JSON.stringify({ staff_id: 8, role: 'super_admin', display_name: '另一个管理员' }))
    setActivePinia(createPinia())
    useUserStore().restoreFromStorage()
    expect(useUserStore().userInfo?.display_name).toBe('隔离代理 A')
    expect(authService.getUser()?.staff_id).toBe(7)
  })
  it('rejects invalid user contracts before writing a partial signed-in session', () => {
    setActivePinia(createPinia())
    const invalid = { status: 'not-a-status' } as unknown as Parameters<ReturnType<typeof useUserStore>['setLogin']>[0]['user']
    expect(() => useUserStore().setLogin({ token: 'must-not-save', role: 'user', user: invalid })).toThrow()
    expect(sessionStorage.getItem('toolbox_token')).toBeNull()
    expect(useUserStore().token).toBeNull()
  })
  it('keeps this tab profile when another tab changes a legacy shared profile', () => {
    authService.setUser({ user_id: 7, role: 'user', name: '本页用户' })
    localStorage.setItem('toolbox_user', JSON.stringify({ staff_id: 8, role: 'super_admin', name: '另一个页面' }))
    expect(readSessionUser()?.user_id).toBe(7)
    expect(generateCacheKey('/api/tools')).toContain('user:7:')
  })
  it('does not persist a newly signed-in profile to shared storage', () => {
    authService.setUser({ user_id: 7 })
    expect(localStorage.getItem('toolbox_user')).toBeNull()
    expect(JSON.parse(sessionStorage.getItem('toolbox_user') || '{}').user_id).toBe(7)
  })
  it('accepts matching legacy JWT identities but rejects cross-user and cross-role data', () => {
    sessionStorage.setItem('toolbox_token', jwt({ user_id: 7, role: 'user', auth_code_id: 3 }))
    localStorage.setItem('toolbox_user', JSON.stringify({ user_id: 7, role: 'user', auth_code_id: 3 }))
    expect(readSessionUser()?.user_id).toBe(7)
    localStorage.setItem('toolbox_user', JSON.stringify({ user_id: 8, role: 'user' }))
    expect(readSessionUser()).toBeNull()
    localStorage.setItem('toolbox_user', JSON.stringify({ user_id: 7, role: 'super_admin' }))
    expect(readSessionUser()).toBeNull()
    localStorage.setItem('toolbox_user', JSON.stringify({ user_id: 7, role: 'user', auth_code_id: 4 }))
    expect(readSessionUser()).toBeNull()
  })
  it('clears the tab profile on logout without touching unrelated preferences', () => {
    authService.setUser({ user_id: 7 })
    localStorage.setItem('density', 'balanced')
    authService.logout()
    expect(sessionStorage.getItem('toolbox_user')).toBeNull()
    expect(localStorage.getItem('density')).toBe('balanced')
  })
})
