import { describe, expect, it } from 'vitest'
import { buildDeviceUnbindPath, normalizeDeviceUnbindReason } from '@/features/admin/deviceUnbind'

describe('管理员设备解绑请求', () => {
  it('强制至少 2 个字且会清理首尾空格', () => {
    expect(() => normalizeDeviceUnbindReason(' ')).toThrow('至少需要 2 个字')
    expect(normalizeDeviceUnbindReason('  客户换机  ')).toBe('客户换机')
  })

  it('把设备 ID 与审计原因安全编码到后端要求的 query', () => {
    const path = buildDeviceUnbindPath(17, '客户 换机')
    const url = new URL(path, 'https://internal.test')
    expect(url.pathname).toBe('/api/devices/unbind')
    expect(url.searchParams.get('device_id')).toBe('17')
    expect(url.searchParams.get('reason')).toBe('客户 换机')
  })
})
