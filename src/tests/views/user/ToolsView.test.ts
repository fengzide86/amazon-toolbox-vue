import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolsView from '@/views/user/ToolsView.vue'
import { useAppStore } from '@/stores/app'

const mocks = vi.hoisted(() => ({
  getTools: vi.fn(),
  createDemoRun: vi.fn(),
  updateDemoRun: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
  route: { query: {} },
}))

vi.mock('@/utils/api', () => ({
  getTools: mocks.getTools,
  createDemoRun: mocks.createDemoRun,
  updateDemoRun: mocks.updateDemoRun,
}))

vi.mock('@/utils', () => ({ showToast: mocks.showToast }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => mocks.route,
}))

function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(ToolsView, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { props: ['to'], template: '<a><slot /></a>' },
        ElDrawer: { template: '<aside><slot name="header" /><slot /><slot name="footer" /></aside>' },
      },
    },
  })
}

describe('ToolsView 一键工具箱', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route.query = {}
    mocks.getTools.mockResolvedValue([])
    mocks.createDemoRun.mockResolvedValue({ id: 'demo-1', tool_id: 'register', status: 'created' })
    mocks.updateDemoRun.mockResolvedValue({ success: true })
    localStorage.setItem('toolbox_user', JSON.stringify({ plan_name: 'Y15 体验包', plan_code: 'Y15' }))
  })

  it('把选择工具作为首页唯一主任务，不显示搜索、分类和成功率', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.toolbox-header h2').text()).toBe('选择一个工具体验演示')
    expect(wrapper.find('.search-box').exists()).toBe(false)
    expect(wrapper.find('.category-tabs').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('成功率')
  })

  it('没有工具时显示明确空状态', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('当前平台暂无可用工具')
  })

  it('区分可用、套餐未包含和维护中的工具', async () => {
    mocks.getTools.mockResolvedValue([
      { id: 'register', name: '注册工具', status: 'online', available_plans: ['Y15'] },
      { id: 'listing', name: '上品工具', status: 'online', available_plans: ['Y199'] },
      { id: 'ads', name: '广告工具', status: 'offline', available_plans: ['Y15'] },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="tool-card-注册工具"]').classes()).toContain('is-available')
    expect(wrapper.find('[data-testid="tool-card-上品工具"]').classes()).toContain('is-locked')
    expect(wrapper.find('[data-testid="tool-card-广告工具"]').classes()).toContain('is-maintenance')
    expect(wrapper.text()).toContain('当前套餐未包含')
    expect(wrapper.text()).toContain('暂时不可用')
  })

  it('点击套餐未包含的工具直接进入套餐页', async () => {
    mocks.getTools.mockResolvedValue([
      { id: 'listing', name: '上品工具', status: 'online', available_plans: ['Y199'] },
    ])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="tool-card-上品工具"]').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ path: '/user/plans', query: { tool: 'listing' } })
    expect(mocks.createDemoRun).not.toHaveBeenCalled()
  })

  it('点击可用工具只创建一次演示记录并进入工作区', async () => {
    mocks.getTools.mockResolvedValue([
      { id: 'register', name: '注册工具', module: 'register', status: 'online', available_plans: ['Y15'] },
    ])
    const wrapper = mountView()
    await flushPromises()
    const card = wrapper.find('[data-testid="tool-card-注册工具"]')

    await Promise.all([card.trigger('click'), card.trigger('click')])
    await flushPromises()

    expect(mocks.createDemoRun).toHaveBeenCalledTimes(1)
    expect(mocks.updateDemoRun).toHaveBeenCalledTimes(1)
    expect(useAppStore().toolVisible).toBe(true)
    expect(useAppStore().currentTool.name).toBe('注册工具')
    expect(useAppStore().currentTool.executionMode).toBe('demo')
  })

  it('按当前平台向后端请求工具', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
    expect(mocks.getTools).toHaveBeenCalledWith({ platform_key: 'amazon' })
  })

  it('只展示真实能力标签和说明入口，不向普通用户暴露批量能力', async () => {
    mocks.getTools.mockResolvedValue([{
      id: 'register', name: '注册工具', status: 'online', available_plans: ['Y15'],
      capability_tags: ['自动填报', '页面核验', '结果确认'],
      preparation_notes: ['准备可用邮箱'],
      intervention_scenarios: ['遇到验证码时'],
      supports_batch: true,
    }])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('自动填报')
    expect(wrapper.text()).toContain('了解能力')
    expect(wrapper.text()).not.toContain('批量')
    expect(wrapper.text()).not.toContain('成功率')
  })
})
