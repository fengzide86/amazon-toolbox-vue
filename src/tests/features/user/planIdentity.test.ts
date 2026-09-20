import { describe, expect, it } from 'vitest'
import { licensePlanCode, readStoredLicense } from '@/features/user/model'

describe('稳定套餐权益标识', () => {
  it.each([
    [{ plan_name: 'Y199 展示名', plan_code: 'Y49' }, 'Y49'],
    [{ plan_name: 'Y199 展示名', plan_code: null }, ''],
    [{ plan_name: 'Y199 展示名' }, ''],
    [{ entitlements: { plan_code: 'Y49' } }, 'Y49'],
    [{ plan_code: null, entitlements: { plan_code: 'Y199' } }, ''],
    [{ plan_code: 'invalid' }, ''],
  ])('只使用后端明确的身份，名称不决定权限', (license, expected) => {
    localStorage.setItem('toolbox_user', JSON.stringify(license))
    expect(licensePlanCode(readStoredLicense())).toBe(expected)
  })

  it('空身份不会导致整个存储授权对象被丢弃', () => {
    localStorage.setItem('toolbox_user', JSON.stringify({ user_id: 7, plan_name: '定制套餐', plan_code: null }))
    expect(readStoredLicense()).toMatchObject({ user_id: 7, plan_name: '定制套餐', plan_code: null })
  })
})
