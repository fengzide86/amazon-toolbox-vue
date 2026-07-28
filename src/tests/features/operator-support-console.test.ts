import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOperatorSupportConsole } from '@/features/ai/useOperatorSupportConsole'

const apiMocks = vi.hoisted(() => ({
  getAIChatConfig: vi.fn(),
  updateAIChatConfig: vi.fn(),
  getAdminChatSessions: vi.fn(),
  getAdminChatSession: vi.fn(),
  getAIChatStats: vi.fn(),
  debugAIChat: vi.fn(),
}))

vi.mock('@/utils/api', () => apiMocks)
vi.mock('@/utils', () => ({ showToast: vi.fn() }))

type ConsoleApi = ReturnType<typeof useOperatorSupportConsole>

function mountConsole(): { api: ConsoleApi; wrapper: ReturnType<typeof mount> } {
  let api: ConsoleApi | undefined
  const Harness = defineComponent({
    setup() {
      api = useOperatorSupportConsole()
      return () => h('div')
    },
  })
  const wrapper = mount(Harness)
  if (!api) throw new Error('console composable was not initialized')
  return { api, wrapper }
}

describe('useOperatorSupportConsole', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMocks.getAIChatConfig.mockResolvedValue({
      welcome_message: '欢迎咨询',
      suggested_questions: '["如何换设备"]',
      transfer_keywords: '["退款","投诉"]',
      max_unmatched: '3',
    })
    apiMocks.getAdminChatSessions.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
    apiMocks.getAIChatStats.mockResolvedValue({ total_sessions: 4, today_sessions: 1 })
    apiMocks.updateAIChatConfig.mockResolvedValue({})
  })

  it('某个辅助接口失败时不阻断配置和其他统计区域', async () => {
    apiMocks.getAdminChatSessions.mockRejectedValueOnce(new Error('会话接口失败'))
    const { api, wrapper } = mountConsole()
    await flushPromises()

    expect(api.configState.value).toBe('data')
    expect(api.statsState.value).toBe('data')
    expect(api.sessionsState.value).toBe('error')
    expect(api.sessionsError.value).toBe('会话接口失败')
    expect(api.config.value.max_unmatched).toBe(3)
    expect(api.transferKeywords.value).toEqual(['退款', '投诉'])
    wrapper.unmount()
  })

  it('保存时只提交规则模式实际使用的字段', async () => {
    const { api, wrapper } = mountConsole()
    await flushPromises()
    api.transferKeywords.value.push('人工')
    await api.saveConfig()

    expect(apiMocks.updateAIChatConfig).toHaveBeenCalledWith({
      welcome_message: '欢迎咨询',
      suggested_questions: ['如何换设备'],
      transfer_keywords: ['退款', '投诉', '人工'],
      max_unmatched: 3,
    })
    wrapper.unmount()
  })

  it('规则预览不再发送向量检索参数', async () => {
    apiMocks.debugAIChat.mockResolvedValue({
      reply: '固定规则答案',
      answer_mode: 'faq',
      ai_used: false,
      knowledge_refs: [],
      fallback_reason: null,
      should_transfer: false,
      diagnostics: { total_ms: 2 },
    })
    const { api, wrapper } = mountConsole()
    await flushPromises()
    api.testMessage.value = '如何换设备'
    await api.sendTest()

    expect(apiMocks.debugAIChat).toHaveBeenCalledWith({
      message: '如何换设备',
      platform_key: 'amazon',
    })
    expect(api.sandboxMessages.value.at(-1)?.content).toBe('固定规则答案')
    wrapper.unmount()
  })
})
