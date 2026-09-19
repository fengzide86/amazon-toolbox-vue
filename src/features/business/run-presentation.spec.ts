import { describe, expect, it } from 'vitest'

import type { BatchItem } from './model'
import { demoProgress, endedAccountCount, executionStage, stagePresentation } from './run-presentation'

function item(status: string, overrides: Partial<BatchItem> = {}): BatchItem {
  return { itemId: 'internal-test-id', status, browserReady: false, ...overrides }
}

describe('business execution presentation', () => {
  it('never substitutes a fixed progress value when no measurement exists', () => {
    expect(demoProgress(item('running'))).toBeNull()
    expect(demoProgress(item('pending'))).toBeNull()
  })

  it('does not let 100% animation progress claim completion before the result event', () => {
    expect(demoProgress(item('running', { progressPercent: 100 }))).toBe(99)
    expect(demoProgress(item('completed', { progressPercent: 72 }))).toBe(100)
    expect(stagePresentation(item('running', { progressPercent: 100, stageIndex: 4 }), 3)).toEqual({ done: false, active: true })
  })

  it.each(['waiting_user', 'failed', 'cancelled'])('does not present %s as 100% completion', status => {
    const current = item(status, { progressPercent: 100, stageIndex: 4 })
    expect(demoProgress(current)).toBeNull()
    expect(stagePresentation(current, 3)).toEqual({ done: false, active: false })
  })

  it('rejects non-finite progress and bounds measurements', () => {
    expect(demoProgress(item('running', { progressPercent: Number.NaN }))).toBeNull()
    expect(demoProgress(item('running', { progressPercent: Number.POSITIVE_INFINITY }))).toBeNull()
    expect(demoProgress(item('running', { progressPercent: -5 }))).toBe(0)
    expect(demoProgress(item('running', { progressPercent: 27.8 }))).toBe(28)
  })

  it('counts ended accounts rather than successful tasks, excluding Live intervention', () => {
    const items = ['pending', 'running', 'waiting_user', 'completed', 'failed', 'cancelled'].map(status => item(status))
    expect(endedAccountCount(items, false)).toBe(3)
    expect(endedAccountCount([item('waiting_user', { progressPercent: 100 })], false)).toBe(0)
  })

  it('counts a finished attention example only in an explicitly Demo batch', () => {
    const example = item('waiting_user', { simulatedOutcome: 'attention_example', finishedAtMs: 1_000 })
    expect(endedAccountCount([example], true)).toBe(1)
    expect(endedAccountCount([example], false)).toBe(0)
    expect(endedAccountCount([item('waiting_user')], true)).toBe(0)
  })

  it('uses actual Live states instead of invented preparation/verification milestones', () => {
    expect(executionStage(item('running', { stageIndex: 3 }), false)).toBe('自动处理中')
    expect(executionStage(item('waiting_user', { stageIndex: 4 }), false)).toBe('等待你操作')
    expect(executionStage(item('completed'), false)).toBe('已完成')
    expect(executionStage(item('failed'), false)).toBe('执行未完成')
    expect(executionStage(item('pending'), false)).toBe('等待开始')
    expect(executionStage(item('unknown'), false)).toBe('等待状态更新')
  })

  it('keeps Demo stages explicitly labelled and does not fabricate a missing stage', () => {
    expect(executionStage(item('running', { stageIndex: 2 }), true)).toBe('演示核验')
    expect(executionStage(item('running'), true)).toBe('正在演示')
    expect(executionStage(item('running', { stageIndex: 4 }), true)).toBe('正在演示')
    expect(executionStage(item('waiting_user'), true)).toBe('需关注案例')
    expect(executionStage(item('failed'), true)).toBe('异常案例')
    expect(executionStage(item('cancelled'), true)).toBe('已结束')
  })
})
