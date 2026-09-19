import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import type { DemoBatch } from '@/features/demo/model'
import type { ServerBatchHistory } from '@/features/business/model'

const mocks = vi.hoisted(() => ({
  loadHistory: vi.fn(),
  loadDemoHistory: vi.fn(),
  useStore: vi.fn(),
}))
vi.mock('@/stores/businessWorkspace', () => ({ useBusinessWorkspaceStore: mocks.useStore }))

import RecordsView from '@/views/business/RecordsView.vue'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function render() {
  return mount(RecordsView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('business record request ordering', () => {
  const wrappers: ReturnType<typeof render>[] = []

  beforeEach(() => {
    vi.resetAllMocks()
    const store = reactive({
      history: [] as ServerBatchHistory[],
      demoHistory: [] as DemoBatch[],
      loadHistory: mocks.loadHistory,
      loadDemoHistory: mocks.loadDemoHistory,
    })
    mocks.useStore.mockReturnValue(store)
  })

  afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

  it('does not let a stale demo failure replace a successfully loaded live tab', async () => {
    const oldDemo = deferred()
    mocks.loadDemoHistory.mockReturnValue(oldDemo.promise)
    mocks.loadHistory.mockResolvedValue(undefined)
    const wrapper = render()
    wrappers.push(wrapper)
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('真实批量工具尚未接入')

    oldDemo.reject(new Error('过期的演示请求失败'))
    await flushPromises()
    expect(wrapper.text()).toContain('真实批量工具尚未接入')
    expect(wrapper.text()).not.toContain('过期的演示请求失败')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('keeps the current tab loading while an older tab request completes', async () => {
    const oldDemo = deferred()
    const currentLive = deferred()
    mocks.loadDemoHistory.mockReturnValue(oldDemo.promise)
    mocks.loadHistory.mockReturnValue(currentLive.promise)
    const wrapper = render()
    wrappers.push(wrapper)
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')

    oldDemo.resolve()
    await flushPromises()
    expect(wrapper.text()).toContain('正在加载记录')
    currentLive.resolve()
    await flushPromises()
    expect(wrapper.text()).toContain('真实批量工具尚未接入')
  })

  it('retains a current error when an older refresh succeeds later', async () => {
    const oldDemo = deferred()
    mocks.loadDemoHistory.mockReturnValue(oldDemo.promise)
    mocks.loadHistory.mockRejectedValue(new Error('当前真实批次请求失败'))
    const wrapper = render()
    wrappers.push(wrapper)
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('当前真实批次请求失败')

    oldDemo.resolve()
    await flushPromises()
    expect(wrapper.text()).toContain('当前真实批次请求失败')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})
