import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolWorkspace from '@/components/ToolWorkspace.vue'
import { useAppStore } from '@/stores/app'
import { useTaskRunStore } from '@/stores/taskRun'
import { AUTOMATION_EVENT } from '@/automation'
import * as runtimeCapabilities from '@/runtime/capabilities'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createLog: vi.fn(),
  createDemoRun: vi.fn(),
  confirmAction: vi.fn(),
  showToast: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/utils/api', () => ({
  createLog: mocks.createLog,
  createDemoRun: mocks.createDemoRun,
  updateDemoRun: vi.fn().mockResolvedValue({}),
  finishDemoRun: vi.fn().mockResolvedValue({}),
  cancelDemoRun: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/utils', () => ({ showToast: mocks.showToast }))
vi.mock('@/shared/ui/confirm', () => ({ confirmAction: mocks.confirmAction }))

describe('ToolWorkspace 极简运行工作台', () => {
  let pinia

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.createDemoRun.mockResolvedValue({ id: 'remote-demo-1', tool_id: 'demo' })
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
    expect(wrapper.text()).toContain('流程展示')
    expect(wrapper.text()).not.toContain('初始化工具环境')
    expect(wrapper.text()).not.toMatch(/\d{2}:\d{2}/)
    wrapper.unmount()
  })

  it('浏览器预览不把动画完成包装成真实填写、核验或证据截图', async () => {
    const wrapper = mountWorkspace()
    await flushPromises()
    expect(wrapper.get('[data-testid="execution-scope-note"]').text()).toContain('不启动 Runner')
    expect(wrapper.get('[data-testid="result-boundary"]').text()).toContain('不代表真实任务成功')
    await vi.advanceTimersByTimeAsync(14_000)
    await flushPromises()
    expect(wrapper.get('.result-card.success').text()).toContain('流程预览已完成')
    expect(wrapper.text()).not.toContain('本地浏览器已完成真实填写')
    expect(wrapper.find('.result-proof-grid').exists()).toBe(false)
    expect(wrapper.find('.execution-evidence').exists()).toBe(false)
    wrapper.unmount()
  })

  it('具备桌面执行器时仍明确显示本地交互沙盒，而非浏览器轻量预览', async () => {
    const capability = vi.spyOn(runtimeCapabilities, 'getRuntimeCapabilities').mockReturnValue({
      ...runtimeCapabilities.resolveRuntimeCapabilities(undefined),
      kind: 'desktop', isDesktop: true, singleLive: true,
    })
    const wrapper = mountWorkspace()
    await flushPromises()
    expect(wrapper.get('[data-testid="execution-scope-note"]').text()).toContain('数据只存在本地沙盒')
    expect(wrapper.text()).not.toContain('浏览器流程预览')
    expect(wrapper.find('webview').exists()).toBe(true)
    wrapper.unmount()
    capability.mockRestore()
  })

  it('后台记录接口失败时仍正常启动本地演示', async () => {
    mocks.createDemoRun.mockRejectedValueOnce(new Error('network unavailable'))
    const wrapper = mountWorkspace()
    await flushPromises()

    expect(useTaskRunStore().status).toBe('running')
    expect(useTaskRunStore().steps).toHaveLength(6)
    expect(wrapper.find('[data-testid="tool-workspace"]').exists()).toBe(true)
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
    await flushPromises()

    expect(mocks.confirmAction).toHaveBeenCalledWith(expect.objectContaining({
      title: '停止本次处理？',
      danger: true,
    }))
    expect(useTaskRunStore().status).toBe('cancelled')
    expect(wrapper.find('.result-card.cancelled').text()).toContain('已退出演示')
    expect(wrapper.find('.result-card.cancelled').text()).toContain('重新演示')
    expect(wrapper.find('.workspace-topbar').text()).not.toContain('返回工具箱')
    wrapper.unmount()
  })

  it('取消仍在等待时保留工作台并防止再次停止或退出', async () => {
    mocks.confirmAction.mockResolvedValue(true)
    const wrapper = mountWorkspace()
    await flushPromises()
    const store = useTaskRunStore()
    const runId = store.runId
    let release!: () => void
    const cancel = vi.spyOn(store, 'cancel').mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    await wrapper.get('[aria-label="返回工具箱"]').trigger('click')
    await flushPromises()
    expect(useAppStore().toolVisible).toBe(true)
    expect(store.runId).toBe(runId)
    expect(wrapper.get('[aria-label="返回工具箱"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.control-button.danger').text()).toContain('正在停止')
    await wrapper.get('.control-button.danger').trigger('click')
    expect(cancel).toHaveBeenCalledOnce()
    release()
    await flushPromises()
    expect(useAppStore().toolVisible).toBe(false)
    expect(store.runId).toBeNull()
    wrapper.unmount()
  })

  it('退出取消失败时保留现场并显示可重试反馈', async () => {
    mocks.confirmAction.mockResolvedValue(true)
    const wrapper = mountWorkspace()
    await flushPromises()
    const store = useTaskRunStore()
    const runId = store.runId
    vi.spyOn(store, 'cancel').mockRejectedValueOnce(new Error('IPC disconnected'))
    await wrapper.get('[aria-label="返回工具箱"]').trigger('click')
    await flushPromises()
    expect(useAppStore().toolVisible).toBe(true)
    expect(store.runId).toBe(runId)
    expect(store.status).toBe('running')
    expect(wrapper.get('[aria-label="返回工具箱"]').attributes('disabled')).toBeUndefined()
    expect(mocks.showToast).toHaveBeenCalledWith('暂时无法退出，当前现场已保留，请重试', 'error')
    await wrapper.get('[aria-label="返回工具箱"]').trigger('click')
    await flushPromises()
    expect(useAppStore().toolVisible).toBe(false)
    wrapper.unmount()
  })

  it('停止失败不会显示已停止或丢失继续操作入口', async () => {
    mocks.confirmAction.mockResolvedValue(true)
    const wrapper = mountWorkspace()
    await flushPromises()
    const store = useTaskRunStore()
    vi.spyOn(store, 'cancel').mockRejectedValueOnce(new Error('IPC disconnected'))
    await wrapper.get('.control-button.danger').trigger('click')
    await flushPromises()
    expect(store.status).toBe('running')
    expect(wrapper.find('.result-card.cancelled').exists()).toBe(false)
    expect(wrapper.get('.control-button.danger').attributes('disabled')).toBeUndefined()
    expect(mocks.showToast).toHaveBeenCalledWith('暂时无法停止，当前现场已保留，请重试', 'error')
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
