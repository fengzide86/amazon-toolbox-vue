import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCustomerSupportChat } from '@/features/ai/useCustomerSupportChat'
import { showToast } from '@/utils'
import { confirmAction } from '@/shared/ui/confirm'

const api = vi.hoisted(() => ({
  createChatSession: vi.fn(), sendChatMessage: vi.fn(), getChatSession: vi.fn(),
  resolveChatSession: vi.fn(), transferChatToHuman: vi.fn(), getChatHistory: vi.fn(),
}))
vi.mock('@/utils/api', () => api)
vi.mock('@/utils', () => ({ showToast: vi.fn() }))
vi.mock('@/shared/ui/confirm', () => ({ confirmAction: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessageBox: { prompt: vi.fn().mockResolvedValue({ value: '工具未能保存' }) } }))

function harness() {
  let chat!: ReturnType<typeof useCustomerSupportChat>
  const wrapper = mount(defineComponent({ setup() {
    chat = useCustomerSupportChat()
    return () => h('div')
  } }))
  return { chat, wrapper }
}

describe('customer support handoff errors', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    api.createChatSession.mockResolvedValue({ session_id: 'session-1', welcome_message: '欢迎咨询' })
    api.getChatHistory.mockResolvedValue({ items: [] })
    vi.mocked(confirmAction).mockResolvedValue(true)
  })

  it('shows the 409 explanation without announcing a newly created ticket', async () => {
    api.transferChatToHuman.mockRejectedValue(new Error('该会话已转人工，请到我的工单查看'))
    const { chat, wrapper } = harness()
    await flushPromises()
    chat.showActions.value = true
    const before = [...chat.messages.value]
    await chat.transferToHuman()
    expect(showToast).toHaveBeenCalledWith('该会话已转人工，请到我的工单查看', 'error')
    expect(chat.messages.value).toEqual(before)
    expect(chat.sessionTransferred.value).toBe(false)
    expect(chat.showActions.value).toBe(true)
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'success')
    wrapper.unmount()
  })

  it.each([new Error('   '), null])('uses a retryable fallback for an unexplained failure: %s', async cause => {
    api.transferChatToHuman.mockRejectedValue(cause)
    const { chat, wrapper } = harness()
    await flushPromises()
    await chat.transferToHuman()
    expect(showToast).toHaveBeenCalledWith('转接失败，请稍后重试', 'error')
    expect(chat.sessionTransferred.value).toBe(false)
    wrapper.unmount()
  })

  it('only announces a new ticket after a successful response', async () => {
    api.transferChatToHuman.mockResolvedValue({ feedback_id: 1 })
    const { chat, wrapper } = harness()
    await flushPromises()
    await chat.transferToHuman()
    expect(chat.sessionTransferred.value).toBe(true)
    expect(chat.messages.value.at(-1)?.content).toContain('已创建人工支持工单')
    expect(showToast).toHaveBeenCalledWith('已转人工客服', 'success')
    wrapper.unmount()
  })
})
