import { afterEach, describe, expect, it, vi } from 'vitest'

import { DemoConcurrencyController, type DemoCompletion } from './demo-concurrency'

describe('DemoConcurrencyController', () => {
  afterEach(() => vi.useRealTimers())

  it.each([8, 50])('starts and completes %i logical accounts concurrently', async count => {
    vi.useFakeTimers()
    const completed: DemoCompletion[] = []
    const onComplete = vi.fn().mockResolvedValue(undefined)
    const controller = new DemoConcurrencyController({
      onProgress: vi.fn(),
      onItemComplete: vi.fn(async completion => { completed.push(completion) }),
      onComplete,
      onError: vi.fn(),
    }, { durationForIndex: index => 600 + index * 10, tickMs: 20 })

    controller.start(Array.from({ length: count }, (_, index) => `item-${index + 1}`))
    expect(controller.activeItemIds()).toHaveLength(count)

    await vi.advanceTimersByTimeAsync(1_500)
    expect(completed).toHaveLength(count)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(new Set(completed.map(item => item.outcome))).toEqual(new Set([
      'completed_example',
      'attention_example',
      'failure_example',
    ]))
  })

  it('stops every unfinished account without completing the batch', async () => {
    vi.useFakeTimers()
    const onComplete = vi.fn().mockResolvedValue(undefined)
    const controller = new DemoConcurrencyController({
      onProgress: vi.fn(),
      onItemComplete: vi.fn().mockResolvedValue(undefined),
      onComplete,
      onError: vi.fn(),
    }, { durationForIndex: () => 2_000, tickMs: 20 })

    controller.start(['one', 'two', 'three'])
    await vi.advanceTimersByTimeAsync(200)
    expect(controller.stop()).toEqual(['one', 'two', 'three'])
    await vi.advanceTimersByTimeAsync(3_000)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
