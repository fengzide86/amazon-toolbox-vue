import { afterEach, describe, expect, it, vi } from 'vitest'

import router from '@/router'
import { authService } from '@/utils/auth'

interface AuthState {
  authenticated?: boolean
  backoffice?: boolean
  role?: 'super_admin' | 'operator' | 'support' | 'user'
  user?: Record<string, unknown>
}

function mockAuth(state: AuthState): void {
  vi.spyOn(authService, 'isAuthenticated').mockReturnValue(state.authenticated ?? false)
  vi.spyOn(authService, 'isBackoffice').mockReturnValue(state.backoffice ?? false)
  vi.spyOn(authService, 'getRole').mockReturnValue(state.role ?? 'user')
  vi.spyOn(authService, 'getUser').mockReturnValue(state.user || null)
}

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await router.push('/user/terms')
})

describe('real route guards', () => {
  it('keeps the public website landing visible even when the browser already has a session', async () => {
    vi.stubGlobal('electronAPI', undefined)
    mockAuth({ authenticated: true, user: { product_type: 'consumer' } })
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('Landing')
  })

  it.each([
    [{}, 'UserLogin'],
    [{ authenticated: true, user: { product_type: 'consumer' } }, 'UserTools'],
    [{ authenticated: true, user: {
      product_type: 'business', business_workspace_enabled: true,
      entitlements: { batch_execution: true, multi_account_workspace: true },
    } }, 'BusinessOverview'],
    [{ authenticated: true, backoffice: true, role: 'operator', user: {} }, 'AdminDashboard'],
  ] as const)('keeps desktop root entry on the matching application route: %s', async (state, destination) => {
    vi.stubGlobal('electronAPI', {})
    mockAuth(state)
    await router.push('/')
    expect(router.currentRoute.value.name).toBe(destination)
  })

  it('redirects anonymous user and administrator routes to their matching login', async () => {
    mockAuth({})
    await router.push('/user/tools')
    expect(router.currentRoute.value.name).toBe('UserLogin')
    await router.push('/admin/dashboard')
    expect(router.currentRoute.value.name).toBe('AdminLogin')
  })

  it('restores consumer and business users to the correct workspace', async () => {
    mockAuth({ authenticated: true, user: { product_type: 'consumer' } })
    await router.push('/user/login')
    expect(router.currentRoute.value.name).toBe('UserTools')
    vi.restoreAllMocks()
    await router.push('/user/terms')

    mockAuth({
      authenticated: true,
      user: {
        product_type: 'business',
        business_workspace_enabled: true,
        entitlements: { batch_execution: true, multi_account_workspace: true },
      },
    })
    await router.push('/user/tools')
    expect(router.currentRoute.value.name).toBe('BusinessOverview')
    await router.push('/user/plans')
    expect(router.currentRoute.value.name).toBe('BusinessLicense')
  })

  it('enforces password reset and back-office role metadata', async () => {
    mockAuth({ authenticated: true, backoffice: true, role: 'support', user: { force_password_reset: true } })
    await router.push('/admin/dashboard')
    expect(router.currentRoute.value.name).toBe('AdminChangePassword')
    vi.restoreAllMocks()

    mockAuth({ authenticated: true, backoffice: true, role: 'support' })
    await router.push('/admin/settings')
    expect(router.currentRoute.value.name).toBe('AdminDashboard')
    expect(router.currentRoute.value.query.access).toBe('role-required')
  })

  it('clears corrupt authentication state when a guard throws', async () => {
    vi.spyOn(authService, 'isAuthenticated')
      .mockImplementationOnce(() => { throw new Error('corrupt') })
      .mockReturnValue(false)
    const clear = vi.spyOn(authService, 'clear').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await router.push('/user/devices')
    expect(router.currentRoute.value.name).toBe('UserLogin')
    expect(clear).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
  })
})
