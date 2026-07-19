import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolWorkspace from '@/components/ToolWorkspace.vue'
import { useAppStore } from '@/stores/app'
import { useTaskRunStore } from '@/stores/taskRun'
import { AUTOMATION_EVENT } from '@/automation'

const mocks = vi.hoisted(() => ({ push: vi.fn(), createLog: vi.fn(), confirmAction: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/utils/api', () => ({
  createLog: mocks.createLog,
  createDemoRun: vi.fn(),
  updateDemoRun: vi.fn().mockResolvedValue({}),
  finishDemoRun: vi.fn().mockResolvedValue({}),
  cancelDemoRun: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/utils', () => ({ showToast: vi.fn() }))
vi.mock('@/shared/ui/confirm', () => ({ confirmAction: mocks.confirmAction }))

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
      targetUrl: 'demo://amazon/demo',
      executionMode: 'demo',
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
      },
    })
  }

  it('只向用户显示四段业务进度，不显示内部六步明细和计时', async () => {
    const wrapper = mountWorkspace()
    await flushPromises()

    expect(wrapper.find('[data-testid="tool-workspace"]').exists()).toBe(true)
    expect(useTaskRunStore().steps).toHaveLength(6)
    expect(wrapper.findAll('.stage-list li')).toHaveLength(4)
    expect(wrapper.text()).toContain('准备')
    expect(wrapper.text()).toContain('执行')
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
    mocks.confirmAction.mockResolvedValue(true)
    const wrapper = mountWorkspace()
    await flushPromises()

    const stopButton = wrapper.findAll('button').find(button => button.text().includes('停止演示'))
    await stopButton.trigger('click')
    await wrapper.vm.$nextTick()

    expect(mocks.confirmAction).toHaveBeenCalledWith(expect.objectContaining({
      title: '停止本次处理？',
      danger: true,
    }))
    expect(useTaskRunStore().status).toBe('cancelled')
    expect(wrapper.find('.result-card.cancelled').text()).toContain('已退出演示')
    expect(wrapper.find('.result-card.cancelled').text()).toContain('重新演示')
    wrapper.unmount()
  })

  it('模拟页面加载异常时提供安全重试，不直接暴露技术错误', async () => {
    const wrapper = mountWorkspace()
    await flushPromises()
    const store = useTaskRunStore()
    store.applyEvent({
      type: AUTOMATION_EVENT.RUN_FAILED,
      runId: store.runId,
      stepId: 'open',
      error: {
        code: 'BROWSER_NAVIGATION_TIMEOUT',
        message: 'net::ERR_TIMED_OUT',
      },
    })
    await wrapper.vm.$nextTick()

    const result = wrapper.find('.result-card.failed')
    expect(result.text()).toContain('模拟场景在准备阶段停止')
    expect(result.text()).toContain('重新加载演示')
    expect(result.find('p').text()).not.toContain('net::ERR_TIMED_OUT')
    expect(wrapper.find('.technical-details').text()).toContain('net::ERR_TIMED_OUT')
    wrapper.unmount()
  })
})
