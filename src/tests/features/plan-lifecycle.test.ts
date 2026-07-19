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
}

describe('套餐生命周期请求', () => {
  it('启用中的套餐只发送展示字段，不发送商业字段或 status', () => {
    expect(buildDisplayPlanPatch({ ...basePlan, status: 'active' })).toEqual({
      name: '演示专业版',
      features: '模拟批次',
    })
  })

  it('禁用套餐才发送价格与有效期', () => {
    expect(buildDisplayPlanPatch({ ...basePlan, status: 'disabled' })).toEqual({
      name: '演示专业版',
      features: '模拟批次',
      price: 199,
      duration_days: 30,
    })
  })

  it('归档套餐不可编辑，产品权限只为禁用套餐构造', () => {
    expect(() => buildDisplayPlanPatch({ ...basePlan, status: 'archived' })).toThrow()
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
