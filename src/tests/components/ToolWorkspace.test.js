import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolWorkspace from '@/components/ToolWorkspace.vue'
import { useAppStore } from '@/stores/app'
import { useTaskRunStore } from '@/stores/taskRun'

describe('ToolWorkspace', () => {
  let pinia

  beforeEach(() => {
    vi.useFakeTimers()
    pinia = createPinia()
    setActivePinia(pinia)
    useAppStore().openTool({
      id: 'demo',
      name: '自动上品演示',
      platformKey: 'amazon',
      targetUrl: 'https://sellercentral.amazon.com',
    })
  })

  afterEach(() => {
    useTaskRunStore().reset()
    vi.useRealTimers()
  })

  it('从 TaskRun Store 渲染步骤并控制暂停恢复', async () => {
    const wrapper = mount(ToolWorkspace, {
      global: {
        plugins: [pinia],
        stubs: { webview: { template: '<div />' } },
      },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="tool-workspace"]').exists()).toBe(true)
    expect(useTaskRunStore().steps).toHaveLength(6)
    expect(wrapper.findAll('.timeline li')).toHaveLength(6)
    expect(wrapper.findAll('.timeline li.active')).toHaveLength(1)

    const pauseButton = wrapper.findAll('button').find(button => button.text().includes('暂停'))
    await pauseButton.trigger('click')

    expect(useTaskRunStore().status).toBe('paused')
    expect(wrapper.findAll('.timeline li.paused')).toHaveLength(1)

    const resumeButton = wrapper.findAll('button').find(button => button.text().includes('继续'))
    await resumeButton.trigger('click')
    expect(useTaskRunStore().status).toBe('running')

    wrapper.unmount()
  })
})
