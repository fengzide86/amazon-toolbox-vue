import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  load: vi.fn(),
  clear: vi.fn(),
  setLogin: vi.fn(),
  setDevice: vi.fn(),
}))

vi.mock('@/utils/api/auth', () => ({ verifyAuthCode: mocks.verify }))
vi.mock('@/utils/credentialStore', () => ({
  loadRememberedUserCode: mocks.load,
  clearRememberedUserCode: mocks.clear,
}))
vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ setLogin: mocks.setLogin, setDevice: mocks.setDevice }),
}))
vi.mock('@/utils/index', () => ({ getDeviceId: () => 'device-1', getDeviceName: () => 'Desktop' }))

import { initializeRememberedLogin } from '@/utils/authBootstrap'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  window.location.hash = '#/user/login'
})

describe('remembered login recovery', () => {
  it('uses an existing session without reading the encrypted credential', async () => {
    sessionStorage.setItem('toolbox_token', 'existing')
    expect(await initializeRememberedLogin()).toBe(true)
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('restores a valid remembered user session', async () => {
    mocks.load.mockResolvedValue('CODE-1')
    mocks.verify.mockResolvedValue({
      success: true,
      data: { token: 'token-1', id: 1, role: 'user', platform_scope: ['amazon'] },
    })
    expect(await initializeRememberedLogin()).toBe(true)
    expect(mocks.setLogin).toHaveBeenCalledWith(expect.objectContaining({ token: 'token-1', auth_code: 'CODE-1' }))
    expect(mocks.setDevice).toHaveBeenCalledWith('device-1', 'Desktop')
    expect(localStorage.getItem('toolbox_platform_scope')).toBe('["amazon"]')
  })

  it('clears a rejected credential but retains one on a transient timeout', async () => {
    mocks.load.mockResolvedValue('CODE-2')
    mocks.verify.mockResolvedValueOnce({ success: false, message: 'expired' })
    expect(await initializeRememberedLogin()).toBe(false)
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(localStorage.getItem('toolbox_auto_login_error')).toBe('expired')

    mocks.clear.mockClear()
    mocks.verify.mockRejectedValueOnce({ kind: 'timeout' })
    expect(await initializeRememberedLogin()).toBe(false)
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(localStorage.getItem('toolbox_auto_login_error')).toBeTruthy()
  })
})
