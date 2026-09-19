import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BusinessBatchRunConsole from '@/features/business/BusinessBatchRunConsole.vue'
import { businessBatchSnapshotSchema, type BatchItem } from '@/features/business/model'
import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'

vi.mock('@/utils', () => ({ showToast: vi.fn() }))

function item(status: string, overrides: Partial<BatchItem> = {}): BatchItem {
  return { itemId: `internal-${status}-9876543210`, accountLabelMasked: `${status}账号`, status, browserReady: false, ...overrides }
}

describe('business run console actual-state display', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    delete window.electronAPI
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  function render(items: BatchItem[], recordKind: 'live' | 'demo' = 'live') {
    const store = useBusinessWorkspaceStore()
    store.snapshot = businessBatchSnapshotSchema.parse({
      status: 'running', recordKind, items,
      counts: {
        total: items.length,
        running: items.filter(current => current.status === 'running').length,
        waiting: items.filter(current => current.status === 'waiting_user').length,
        completed: items.filter(current => current.status === 'completed').length,
        failed: items.filter(current => current.status === 'failed').length,
      },
    })
    store.selectedItemId = items[0]?.itemId ?? null
    wrapper = mount(BusinessBatchRunConsole, { global: { stubs: { Teleport: true } } })
    return { store, view: wrapper }
  }

  it('shows sequential Live copy without Demo results, internal IDs or invented percentages', () => {
    const { view } = render([item('running'), item('waiting_user'), item('completed'), item('failed'), item('pending')])
    expect(view.text()).toContain('依次执行')
    expect(view.text()).toContain('等待执行结果')
    expect(view.text()).not.toMatch(/并发|演示|案例|42%|100%|9876543210/)
    expect(view.find('.row-progress').exists()).toBe(false)
    expect(view.find('.stage-track').exists()).toBe(false)
    expect(view.get('[aria-label="已结束账号数"]').text()).toContain('2 / 5')
    expect(view.findAll('webview')).toHaveLength(2)
  })

  it('does not render an incoming percentage or stage as a Live result', () => {
    const { view } = render([item('waiting_user', { progressPercent: 100, stageIndex: 4 })])
    expect(view.get('[aria-label="已结束账号数"]').text()).toContain('0 / 1')
    expect(view.get('.progress-description').text()).toBe('等待你操作')
    expect(view.text()).not.toContain('100%')
    expect(view.find('.stage-track').exists()).toBe(false)
  })

  it('preserves Demo concurrency presentation without launching browser webviews', () => {
    const { view } = render([
      item('running', { progressPercent: 37, stageIndex: 1 }),
      item('waiting_user', { progressPercent: 100, simulatedOutcome: 'attention_example' }),
    ], 'demo')
    expect(view.text()).toContain('并发演示')
    expect(view.text()).toContain('37%')
    expect(view.text()).toContain('需关注案例')
    expect(view.text()).not.toContain('100%')
    expect(view.get('[aria-label="已结束账号数"]').text()).toContain('1 / 2')
    expect(view.findAll('webview')).toHaveLength(0)
  })

  it('keeps intervention unfinished, and routes continue/retry to the existing store actions', async () => {
    const { view, store } = render([item('waiting_user'), item('failed')])
    const continueAction = vi.spyOn(store, 'completeUserAction').mockResolvedValue(undefined)
    const retryAction = vi.spyOn(store, 'restartItem').mockResolvedValue(undefined)
    await view.get('tbody tr.is-waiting_user').trigger('click')
    expect(view.get('.detail-status').text()).toContain('当前任务尚未完成')
    await view.get('.primary-action').trigger('click')
    expect(continueAction).toHaveBeenCalledWith('internal-waiting_user-9876543210')
    await view.get('tbody tr.is-failed').trigger('click')
    expect(view.get('.detail-status').text()).not.toContain('案例')
    await view.get('.primary-action').trigger('click')
    expect(retryAction).toHaveBeenCalledWith('internal-failed-9876543210')
    await view.get('[aria-label="关闭详情"]').trigger('click')
    expect(view.get('.detail-layer').classes()).not.toContain('open')
  })

  it('does not describe a sync error as a local batch exit', async () => {
    const { view, store } = render([item('running')])
    store.syncState = 'offline'
    await view.vm.$nextTick()
    expect(view.get('.sync-state').text()).toBe('同步待重试')
    expect(store.isActive).toBe(true)
  })

  it('does not count or filter queued accounts as actively running', async () => {
    const { view } = render([item('running'), item('pending')])
    const runningFilter = view.findAll('.status-filters button').find(button => button.text().startsWith('运行中'))!
    expect(runningFilter.text()).toBe('运行中1')
    await runningFilter.trigger('click')
    expect(runningFilter.attributes('aria-pressed')).toBe('true')
    expect(view.findAll('tbody tr')).toHaveLength(1)
    expect(view.get('tbody tr').classes()).toContain('is-running')
  })

  it('searches visible account labels only and keeps exit and new-batch events intact', async () => {
    const { view, store } = render([item('running', { accountLabelMasked: '团队甲' })])
    await view.get('input[type="search"]').setValue('9876543210')
    expect(view.find('tbody').exists()).toBe(false)
    await view.get('input[type="search"]').setValue('团队甲')
    expect(view.findAll('tbody tr')).toHaveLength(1)
    await view.get('.exit-button').trigger('click')
    expect(view.emitted('exit')).toHaveLength(1)
    store.snapshot.status = 'completed'
    await view.vm.$nextTick()
    await view.get('.new-button').trigger('click')
    expect(view.emitted('new')).toHaveLength(1)
  })
})
