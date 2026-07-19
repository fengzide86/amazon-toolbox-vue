import { describe, expect, it } from 'vitest'
import { buildPendingOrderPayload } from '@/features/admin/orderLifecycle'

describe('订单状态机请求', () => {
  it('创建订单不允许携带 status，只生成待收款订单字段', () => {
    const payload = buildPendingOrderPayload({
      plan_id: 3,
      amount: 199,
      channel: ' 微信 ',
      responsible: ' 小王 ',
    }, 'amazon')

    expect(payload).toEqual({
      plan_id: 3,
      amount: 199,
      channel: '微信',
      responsible: '小王',
      platform_key: 'amazon',
    })
    expect(payload).not.toHaveProperty('status')
  })
})
