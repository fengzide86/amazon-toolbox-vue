import { describe, expect, it } from 'vitest'
import { buildDisplayPlanPatch, buildPlanPermissionsPatch } from '@/features/admin/planLifecycle'

const basePlan = {
  id: 1,
  name: ' 演示专业版 ',
  price: 199,
  duration_days: 30,
  features: '模拟批次',
  product_type: 'business' as const,
  entitlements: {},
  status: 'active',
}

describe('套餐生命周期请求', () => {
  it('启用中的套餐仅发送实际变化的价格及其旧值，不发送有效期或 status', () => {
    expect(buildDisplayPlanPatch({ ...basePlan, price: 299, duration_days: 60 }, basePlan)).toEqual({
      price: 299,
      expected_price: 199,
    })
  })

  it('禁用套餐也使用价格校验，并仅发送变化的有效期', () => {
    const disabled = { ...basePlan, status: 'disabled' }
    expect(buildDisplayPlanPatch({ ...disabled, duration_days: 60 }, disabled)).toEqual({ duration_days: 60 })
    expect(buildDisplayPlanPatch({ ...disabled, price: 9.99 }, disabled)).toEqual({
      price: 9.99, expected_price: 199,
    })
  })

  it('只修改说明不附带过期价格；清空说明发送 null', () => {
    expect(buildDisplayPlanPatch({ ...basePlan, features: '新说明' }, basePlan)).toEqual({ features: '新说明' })
    expect(buildDisplayPlanPatch({ ...basePlan, features: '' }, basePlan)).toEqual({ features: null })
    expect(buildDisplayPlanPatch({ ...basePlan, name: ' 新名称 ' }, basePlan)).toEqual({ name: '新名称' })
  })

  it('没有改动不生成请求，包括名称首尾空格和空说明的等价形式', () => {
    expect(buildDisplayPlanPatch({ ...basePlan, name: basePlan.name.trim() }, basePlan)).toEqual({})
    expect(buildDisplayPlanPatch({ ...basePlan, features: '' }, { ...basePlan, features: null })).toEqual({})
  })

  it.each([0, -1, NaN, Infinity, 1.001, 100000000])('拒绝无效金额 %s', (price) => {
    expect(() => buildDisplayPlanPatch({ ...basePlan, price }, basePlan)).toThrow('套餐价格')
  })

  it.each([0.01, 19.99, 99999999.99])('允许有效金额 %s', (price) => {
    expect(buildDisplayPlanPatch({ ...basePlan, price }, basePlan)).toEqual({ price, expected_price: 199 })
  })

  it.each(['   ', 'a'.repeat(101)])('拒绝空名称或过长名称', (name) => {
    expect(() => buildDisplayPlanPatch({ ...basePlan, name }, basePlan)).toThrow('套餐名称')
  })

  it.each([0, -1, 1.5, 3651, undefined])('拒绝禁用套餐的无效有效期 %s', (duration_days) => {
    const disabled = { ...basePlan, status: 'disabled' }
    expect(() => buildDisplayPlanPatch({ ...disabled, duration_days }, disabled)).toThrow('有效期')
  })

  it('拒绝 mismatched ID 或状态的编辑快照', () => {
    expect(() => buildDisplayPlanPatch({ ...basePlan, id: 2 }, basePlan)).toThrow('套餐状态')
    expect(() => buildDisplayPlanPatch({ ...basePlan, status: 'disabled' }, basePlan)).toThrow('套餐状态')
  })

  it('归档套餐不可编辑，产品权限只为禁用套餐构造', () => {
    expect(() => buildDisplayPlanPatch({ ...basePlan, status: 'archived' }, basePlan)).toThrow()
    expect(buildPlanPermissionsPatch({
      id: 1,
      status: 'disabled',
      product_type: 'business',
      batchEnabled: true,
      maxBatchRows: 50,
      maxOpenSessions: 3,
      desktopNotification: true,
    })).toMatchObject({
      product_type: 'business',
      entitlements: {
        batch_execution: true,
        multi_account_workspace: true,
        max_batch_rows: 50,
        max_open_sessions: 3,
      },
    })
  })
})
