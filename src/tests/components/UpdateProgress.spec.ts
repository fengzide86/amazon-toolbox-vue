import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import UpdateProgress from '@/components/UpdateProgress.vue'
import type { UpdateSnapshot } from '@/shared/ipc/update-contract'

const available: UpdateSnapshot = {
  status: 'available',
  currentVersion: '1.7.2',
  availableVersion: '1.8.0',
  releaseNotes: ['公告中心支持定向消息'],
  canRestart: false,
}

describe('UpdateProgress', () => {
  let listener: ((state: UpdateSnapshot) => void) | undefined
  const removeListener = vi.fn()
  const bridge = {
    getState: vi.fn(async () => ({ ...available })),
    check: vi.fn(async () => ({ ...available })),
    startDownload: vi.fn(async () => ({ ...available, status: 'downloading' as const, percent: 0 })),
    cancelDownload: vi.fn(async () => ({ ...available, status: 'cancelled' as const })),
    install: vi.fn(async () => ({ ...available, status: 'installing' as const })),
    defer: vi.fn(async () => ({ ...available, status: 'idle' as const })),
    onState: vi.fn((callback: (state: UpdateSnapshot) => void) => {
      listener = callback
      return removeListener
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI = { updates: bridge }
  })

  afterEach(() => { delete window.electronAPI })

  it('asks before downloading and renders updater release notes', async () => {
    const wrapper = mount(UpdateProgress)
    await flushPromises()

    expect(wrapper.find('.update-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('v1.7.2')
    expect(wrapper.text()).toContain('v1.8.0')
    expect(wrapper.text()).toContain('公告中心支持定向消息')
    expect(bridge.startDownload).not.toHaveBeenCalled()
  })

  it('downloads only after the primary action is clicked', async () => {
    const wrapper = mount(UpdateProgress)
    await flushPromises()
    const download = wrapper.findAll('button').find(button => button.text() === '下载更新')

    await download?.trigger('click')
    await flushPromises()

    expect(bridge.startDownload).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('正在后台下载')
  })

  it('shows only real progress and byte totals', async () => {
    const wrapper = mount(UpdateProgress)
    await flushPromises()
    listener?.({
      ...available,
      status: 'downloading',
      percent: 42.4,
      transferredBytes: 10 * 1024 * 1024,
      totalBytes: 25 * 1024 * 1024,
    })
    await flushPromises()

    expect(wrapper.text()).toContain('42%')
    expect(wrapper.text()).toContain('10.0 MB / 25.0 MB')
    expect(wrapper.text()).not.toContain('剩余')
    expect(wrapper.text()).not.toContain('速度')
    expect(wrapper.text()).not.toContain('暂停')
  })

  it('does not offer an unsafe restart while automation is active', async () => {
    const wrapper = mount(UpdateProgress)
    await flushPromises()
    listener?.({ ...available, status: 'restart_deferred', percent: 100, canRestart: false })
    await flushPromises()

    expect(wrapper.text()).toContain('系统不会打断工作')
    expect(wrapper.text()).not.toContain('立即重启')
  })

  it('cleans its IPC subscription on unmount', async () => {
    const wrapper = mount(UpdateProgress)
    await flushPromises()
    wrapper.unmount()
    expect(removeListener).toHaveBeenCalledOnce()
  })
})
