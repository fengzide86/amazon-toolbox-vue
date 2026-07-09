import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AUTOMATION_EVENT, MockAutomationAdapter } from '@/automation'
import { useTaskRunStore } from '@/stores/taskRun'

const tool = {
  id: 'tool_listing',
  name: '自动上品脚本',
  platformKey: 'amazon',
  targetUrl: 'https://sellercentral.amazon.com/listing',
}

describe('taskRun store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    useTaskRunStore().reset()
    delete window.electronAPI
    vi.useRealTimers()
  })

  it('通过统一事件协议推进完整模拟任务', async () => {
    const store = useTaskRunStore()
    const adapter = new MockAutomationAdapter({ stepDelay: 10 })

    store.start(tool, { adapter })

    expect(store.status).toBe('running')
    expect(store.steps).toHaveLength(6)
    expect(store.currentStep.id).toBe('prepare')
    expect(store.steps[0].status).toBe('active')

    await vi.advanceTimersByTimeAsync(60)

    expect(store.status).toBe('completed')
    expect(store.completedCount).toBe(6)
    expect(store.progressPercent).toBe(100)
    expect(store.result.summary).toBe('模拟任务已完成')
  })

  it('暂停后不推进步骤，恢复后继续执行', async () => {
    const store = useTaskRunStore()
    const adapter = new MockAutomationAdapter({ stepDelay: 20 })

    store.start(tool, { adapter })
    store.pause()

    expect(store.status).toBe('paused')
    expect(store.steps[0].status).toBe('paused')

    await vi.advanceTimersByTimeAsync(100)
    expect(store.completedCount).toBe(0)

    store.resume()
    await vi.advanceTimersByTimeAsync(20)

    expect(store.status).toBe('running')
    expect(store.completedCount).toBe(1)
    expect(store.currentStep.id).toBe('open')
  })

  it('取消任务后进入终态并停止推进', async () => {
    const store = useTaskRunStore()
    const adapter = new MockAutomationAdapter({ stepDelay: 10 })

    store.start(tool, { adapter })
    store.cancel()
    await vi.advanceTimersByTimeAsync(100)

    expect(store.status).toBe('cancelled')
    expect(store.completedCount).toBe(0)
  })

  it('可以在完成后启动新的运行实例', async () => {
    const store = useTaskRunStore()
    const firstAdapter = new MockAutomationAdapter({ stepDelay: 10 })
    store.start(tool, { adapter: firstAdapter })
    const firstRunId = store.runId
    await vi.advanceTimersByTimeAsync(60)
    expect(store.status).toBe('completed')

    const secondAdapter = new MockAutomationAdapter({ stepDelay: 10 })
    store.start(tool, { adapter: secondAdapter })

    expect(store.status).toBe('running')
    expect(store.runId).not.toBe(firstRunId)
    expect(store.completedCount).toBe(0)
    expect(store.steps[0].status).toBe('active')
  })

  it('在 Electron 中把完整工具授权交给本地 Runner Adapter', () => {
    let listener
    const automation = {
      onEvent: vi.fn(callback => { listener = callback; return vi.fn() }),
      start: vi.fn(() => Promise.resolve({ runId: 'local_run_1' })),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
    }
    window.electronAPI = { automation }
    const store = useTaskRunStore()
    const toolWithGrant = {
      ...tool,
      launchGrant: { token: 'one-time-token', scriptKey: 'amazon.listing.v1', runnerApiVersion: 1 },
    }

    store.start(toolWithGrant)
    expect(automation.start).toHaveBeenCalledWith(toolWithGrant)

    listener({
      type: AUTOMATION_EVENT.RUN_STARTED,
      runId: 'local_run_1',
      tool: toolWithGrant,
      steps: [{ id: 'prepare', title: '准备' }],
    })
    expect(store.status).toBe('running')
    expect(store.runId).toBe('local_run_1')
  })
})
