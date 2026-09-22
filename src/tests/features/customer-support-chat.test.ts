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

  it('exposes a retry after initial connection failure', async () => {
    api.createChatSession.mockRejectedValueOnce(new Error('offline'))
    const { chat, wrapper } = harness()
    await flushPromises()
    expect(chat.sessionError.value).toContain('重试')
    expect(chat.sessionLoading.value).toBe(false)
    await chat.startNewSession()
    expect(chat.sessionId.value).toBe('session-1')
    expect(chat.sessionError.value).toBe('')
    wrapper.unmount()
  })

  it('keeps failed user content and retries without adding a fake AI answer', async () => {
    api.sendChatMessage.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ session_id: 'session-1', reply: '已收到' })
    const { chat, wrapper } = harness()
    await flushPromises()
    chat.inputMessage.value = '授权无法使用'
    await chat.sendMessage()
    const message = chat.messages.value.at(-1)!
    expect(message).toMatchObject({ role: 'user', content: '授权无法使用', delivery: 'failed' })
    expect(chat.messages.value.some(item => item.role === 'ai')).toBe(false)
    await chat.retryMessage(message.id)
    expect(chat.messages.value.filter(item => item.role === 'user')).toHaveLength(1)
    expect(message.delivery).toBe('sent')
    expect(chat.messages.value.at(-1)?.content).toBe('已收到')
    wrapper.unmount()
  })

  it('isolates late replies from the newly selected session', async () => {
    let release!: (value: unknown) => void
    api.sendChatMessage.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    api.getChatSession.mockResolvedValue({ session_id: 'session-2', status: 'active', messages: [{ role: 'ai', content: '另一个会话' }] })
    const { chat, wrapper } = harness()
    await flushPromises()
    chat.inputMessage.value = '原会话问题'
    const sending = chat.sendMessage()
    await chat.loadSession('session-2')
    release({ session_id: 'session-1', reply: '原会话回答' })
    await sending
    expect(chat.sessionId.value).toBe('session-2')
    expect(chat.messages.value.map(item => item.content)).toEqual(['另一个会话'])
    expect(chat.lastAiMessage.value).toBe('另一个会话')
    wrapper.unmount()
  })

  it('keeps the last selected history when responses arrive backwards', async () => {
    let release!: (value: unknown) => void
    api.getChatSession.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
      .mockResolvedValueOnce({ session_id: 'new', status: 'resolved', messages: [] })
    const { chat, wrapper } = harness()
    await flushPromises()
    const old = chat.loadSession('old')
    await chat.loadSession('new')
    release({ session_id: 'old', status: 'active', messages: [] })
    await old
    expect(chat.sessionId.value).toBe('new')
    expect(chat.sessionResolved.value).toBe(true)
    await chat.startNewSession()
    expect(chat.sessionResolved.value).toBe(false)
    wrapper.unmount()
  })
})
