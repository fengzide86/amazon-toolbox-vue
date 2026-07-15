import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolWorkspace from '@/components/ToolWorkspace.vue'
import { useAppStore } from '@/stores/app'
import { useTaskRunStore } from '@/stores/taskRun'
import { AUTOMATION_EVENT } from '@/automation'

const mocks = vi.hoisted(() => ({ push: vi.fn(), createLog: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/utils/api', () => ({ createLog: mocks.createLog }))
vi.mock('@/utils/api/tools', () => ({ createToolLaunchGrant: vi.fn() }))
vi.mock('@/utils', () => ({ showToast: vi.fn() }))

describe('ToolWorkspace 极简运行工作台', () => {
  let pinia

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
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

  function mountWorkspace() {
    return mount(ToolWorkspace, {
      global: {
        plugins: [pinia],
        stubs: { webview: { template: '<div />' } },
      },
    })
  }

  it('只向用户显示四段业务进度，不显示内部六步明细和计时', async () => {
    const wrapper = mountWorkspace()
    await flushPromises()

    expect(wrapper.find('[data-testid="tool-workspace"]').exists()).toBe(true)
    expect(useTaskRunStore().steps).toHaveLength(6)
    expect(wrapper.findAll('.stage-list li')).toHaveLength(4)
    expect(wrapper.text()).toContain('准备环境')
    expect(wrapper.text()).toContain('自动处理')
    expect(wrapper.text()).not.toContain('初始化工具环境')
    expect(wrapper.text()).not.toMatch(/\d{2}:\d{2}/)
    wrapper.unmount()
  })

  it('需要人工操作时只给一个明确的继续按钮', async () => {
    const wrapper = mountWorkspace()
    await flushPromises()
    const store = useTaskRunStore()
    store.applyEvent({
      type: AUTOMATION_EVENT.USER_ACTION_REQUIRED,
      runId: store.runId,
      action: { title: '请完成验证码', instruction: '在左侧页面完成验证码。' },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.user-action-card').text()).toContain('请完成验证码')
    expect(wrapper.find('.user-action-card button').text()).toBe('我已完成，继续处理')
    expect(wrapper.find('.interaction-shield').exists()).toBe(false)
    wrapper.unmount()
  })

  it('停止操作必须确认，并进入可重新执行的停止结果页', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mountWorkspace()
    await flushPromises()

    const stopButton = wrapper.findAll('button').find(button => button.text().includes('停止操作'))
    await stopButton.trigger('click')
    await wrapper.vm.$nextTick()

    expect(window.confirm).toHaveBeenCalledWith('确定停止本次自动操作吗？')
    expect(useTaskRunStore().status).toBe('cancelled')
    expect(wrapper.find('.result-card.cancelled').text()).toContain('操作已停止')
    expect(wrapper.find('.result-card.cancelled').text()).toContain('重新执行')
    wrapper.unmount()
  })
})
