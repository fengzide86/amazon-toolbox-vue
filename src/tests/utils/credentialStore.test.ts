import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRememberedUserCode,
  loadRememberedUserCode,
  saveRememberedUserCode,
} from '@/utils/credentialStore'

describe('安全授权码存储', () => {
  const store = {
    saveUserCode: vi.fn(),
    loadUserCode: vi.fn(),
    clearUserCode: vi.fn(),
  }

  beforeEach(() => {
    window.electronAPI = { credentialStore: store }
  })

  it('通过 Electron 主进程保存和读取授权码', async () => {
    store.saveUserCode.mockResolvedValue(true)
    store.loadUserCode.mockResolvedValue('CODE-123')
    await expect(saveRememberedUserCode('CODE-123')).resolves.toBe(true)
    await expect(loadRememberedUserCode()).resolves.toBe('CODE-123')
  })

  it('把旧版明文授权码迁移到安全存储并删除明文', async () => {
    localStorage.setItem('toolbox_auth', JSON.stringify({ auth_code: 'LEGACY-CODE' }))
    store.loadUserCode.mockResolvedValue(null)
    store.saveUserCode.mockResolvedValue(true)
    await expect(loadRememberedUserCode()).resolves.toBe('LEGACY-CODE')
    expect(store.saveUserCode).toHaveBeenCalledWith('LEGACY-CODE')
    expect(localStorage.getItem('toolbox_auth')).toBeNull()
  })

  it('退出时清除主进程凭据', async () => {
    store.clearUserCode.mockResolvedValue(true)
    await clearRememberedUserCode()
    expect(store.clearUserCode).toHaveBeenCalledOnce()
  })
})
