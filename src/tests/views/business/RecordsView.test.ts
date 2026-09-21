import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import type { DemoBatch } from '@/features/demo/model'
import type { ServerBatchHistory } from '@/features/business/model'

const mocks = vi.hoisted(() => ({
  loadHistory: vi.fn(),
  loadDemoHistory: vi.fn(),
  useStore: vi.fn(),
  getDemoBatch: vi.fn(),
  getBusinessBatch: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/stores/businessWorkspace', () => ({ useBusinessWorkspaceStore: mocks.useStore }))
vi.mock('@/utils/api', () => ({ getDemoBatch: mocks.getDemoBatch, getBusinessBatch: mocks.getBusinessBatch }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

import RecordsView from '@/views/business/RecordsView.vue'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function render() {
  return mount(RecordsView, {
    global: { stubs: { ElDrawer: { props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot /><slot name="footer" /></section>' }, RouterLink: { template: '<a><slot /></a>' } } },
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
      demoHistoryTotal: 0,
      liveHistoryHasMore: false,
      isActive: false,
      tools: [],
      resetWorkspace: vi.fn().mockResolvedValue(undefined),
      chooseTool: vi.fn(),
    })
    mocks.useStore.mockReturnValue(store)
  })

  afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

  it('opens a read-only result drawer and requests more records', async () => {
    const store = mocks.useStore()
    store.demoHistory = [{ id: 'one', tool_id: 'tool', tool_name_snapshot: '批量演示', row_count: 1, played_count: 1, skipped_count: 0, error_count: 0, status: 'completed' }]
    store.demoHistoryTotal = 21
    mocks.loadDemoHistory.mockResolvedValue(undefined)
    mocks.getDemoBatch.mockResolvedValue({ ...store.demoHistory[0], items: [{ item_ref: 'private', status: 'played', simulated_outcome: 'attention_example' }] })
    const wrapper = render()
    wrappers.push(wrapper)
    await flushPromises()
    await wrapper.get('.pagination button').trigger('click')
    expect(mocks.loadDemoHistory).toHaveBeenLastCalledWith(true)
    await wrapper.get('.detail-link').trigger('click')
    await flushPromises()
    expect(mocks.getDemoBatch).toHaveBeenCalledWith('one')
    expect(wrapper.get('[role="dialog"]').text()).toContain('人工操作案例（无待办）')
    expect(wrapper.get('[role="dialog"]').text()).not.toContain('private')
    const replay = wrapper.findAll('.detail-actions button').find(button => button.text() === '重新准备演示')!
    await replay.trigger('click')
    await flushPromises()
    expect(store.resetWorkspace).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/business/workspace')
  })

  it('retries failed batch details without discarding the history list', async () => {
    const store = mocks.useStore()
    store.demoHistory = [{ id: 'one', tool_id: 'tool', tool_name_snapshot: '批量演示', row_count: 1, played_count: 1, skipped_count: 0, error_count: 0, status: 'completed' }]
    mocks.loadDemoHistory.mockResolvedValue(undefined)
    mocks.getDemoBatch.mockRejectedValueOnce(new Error('详情网络失败')).mockResolvedValueOnce({ ...store.demoHistory[0], items: [] })
    const wrapper = render()
    wrappers.push(wrapper)
    await flushPromises()
    await wrapper.get('.detail-link').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('详情网络失败')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="dialog"]').text()).toContain('该批次尚无账号结果记录')
    expect(wrapper.findAll('.records-list article')).toHaveLength(1)
  })

  it('does not let a stale demo failure replace a successfully loaded live tab', async () => {
    const oldDemo = deferred()
    mocks.loadDemoHistory.mockReturnValue(oldDemo.promise)
    mocks.loadHistory.mockResolvedValue(undefined)
    const wrapper = render()
    wrappers.push(wrapper)
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('还没有真实批次记录')

    oldDemo.reject(new Error('过期的演示请求失败'))
    await flushPromises()
    expect(wrapper.text()).toContain('还没有真实批次记录')
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
    expect(wrapper.text()).toContain('还没有真实批次记录')
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
