import { describe, expect, it } from 'vitest'
import { isBackofficeEntry } from '@/utils/authBootstrap'

describe('startup entry routing', () => {
  it('recognizes administrator routes without treating user routes as back-office entry', () => {
    expect(isBackofficeEntry('#/admin/login')).toBe(true)
    expect(isBackofficeEntry('#/admin/dashboard?source=preview')).toBe(true)
    expect(isBackofficeEntry('#/user/login')).toBe(false)
    expect(isBackofficeEntry('')).toBe(false)
  })
})
