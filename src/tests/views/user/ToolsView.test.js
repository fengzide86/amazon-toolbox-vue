import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolsView from '@/views/user/ToolsView.vue'
import { useAppStore } from '@/stores/app'

const mocks = vi.hoisted(() => ({
  getTools: vi.fn(),
  createToolLaunchGrant: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
  route: { query: {} },
}))

vi.mock('@/utils/api', () => ({
  getTools: mocks.getTools,
  createToolLaunchGrant: mocks.createToolLaunchGrant,
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
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } },
    },
  })
}

describe('ToolsView 一键工具箱', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route.query = {}
    mocks.getTools.mockResolvedValue([])
    mocks.createToolLaunchGrant.mockResolvedValue({
      launch_data: {
        token: 'grant-token',
        tool_id: 'register',
        tool_name: '注册工具',
        target_url: 'https://sellercentral.amazon.com',
        platform_key: 'amazon',
      },
    })
    localStorage.setItem('toolbox_user', JSON.stringify({ plan_name: 'Y15 体验包', plan_code: 'Y15' }))
  })

  it('把选择工具作为首页唯一主任务，不显示搜索、分类和成功率', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.toolbox-header h2').text()).toBe('选择一个工具开始')
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
    expect(mocks.createToolLaunchGrant).not.toHaveBeenCalled()
  })

  it('点击可用工具只申请一次授权并进入工作区', async () => {
    mocks.getTools.mockResolvedValue([
      { id: 'register', name: '注册工具', module: 'register', status: 'online', available_plans: ['Y15'] },
    ])
    const wrapper = mountView()
    await flushPromises()
    const card = wrapper.find('[data-testid="tool-card-注册工具"]')

    await Promise.all([card.trigger('click'), card.trigger('click')])
    await flushPromises()

    expect(mocks.createToolLaunchGrant).toHaveBeenCalledTimes(1)
    expect(useAppStore().toolVisible).toBe(true)
    expect(useAppStore().currentTool.name).toBe('注册工具')
  })

  it('按当前平台向后端请求工具', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
    expect(mocks.getTools).toHaveBeenCalledWith({ platform_key: 'amazon' })
  })
})
