import { ref, nextTick, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { createChatSession, sendChatMessage, getChatSession, resolveChatSession, transferChatToHuman, getChatHistory } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'
import { confirmAction } from '@/shared/ui/confirm'
import {
  chatHistorySchema,
  chatReplySchema,
  chatSessionCreatedSchema,
  chatSessionDetailSchema,
  parseJsonRecord,
  type ChatMessage,
  type ChatSessionSummary,
} from '@/features/ai/model'
import { formatChatTime as formatTime, supportSessionStatusLabel as getStatusText } from './presentation'


export function useCustomerSupportChat() {
const platformStore = usePlatformStore()

const sessionId = ref<string | null>(null)
const messages = ref<ChatMessage[]>([])
const inputMessage = ref('')
const isLoading = ref(false)
const isTransferring = ref(false)
const showActions = ref(false)
const showRating = ref(false)
const rating = ref(0)
const sessionResolved = ref(false)
const sessionTransferred = ref(false)
const lastAiMessage = ref<string | null>(null)
const messagesContainer = ref<HTMLElement | null>(null)
const showHistory = ref(false)
const historySessions = ref<ChatSessionSummary[]>([])
let nextMsgId = 0
const quickQuestions = ['授权码无法使用', '工具一直没有反应', '本次操作未完成', '需要更换设备', '联系人工客服']

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

async function startNewSession() {
  try {
    const res = chatSessionCreatedSchema.parse(await createChatSession({ platform_key: platformStore.currentPlatform }))
    sessionId.value = res.session_id
    nextMsgId = 1
    messages.value = [{
      id: nextMsgId++,
      role: 'system',
      content: res.welcome_message || '您好！我是 AI 客服，请问有什么可以帮您？',
      created_at: new Date().toISOString()
    }]
    showActions.value = false
    showRating.value = false
    sessionResolved.value = false
    sessionTransferred.value = false
    scrollToBottom()
    return true
  } catch {
    showToast('创建会话失败', 'error')
    return false
  }
}

function askQuickQuestion(question: string) {
  if (question === '联系人工客服') {
    transferToHuman()
    return
  }
  inputMessage.value = question
  sendMessage()
}

async function sendMessage() {
  const text = inputMessage.value.trim()
  if (!text || isLoading.value) return
  if (!sessionId.value && !await startNewSession()) return
  if (!sessionId.value) return

  messages.value.push({
    id: nextMsgId++,
    role: 'user',
    content: text,
    created_at: new Date().toISOString()
  })
  inputMessage.value = ''
  isLoading.value = true
  showActions.value = false
  scrollToBottom()

  try {
    const res = chatReplySchema.parse(await sendChatMessage(sessionId.value, text, { platform_key: platformStore.currentPlatform }))
    messages.value.push({
      id: nextMsgId++,
      role: 'ai',
      content: res.reply,
      knowledge_refs: res.knowledge_refs || [],
      created_at: new Date().toISOString()
    })
    lastAiMessage.value = res.reply
    showActions.value = true
  } catch {
    messages.value.push({
      id: nextMsgId++,
      role: 'ai',
      content: '抱歉，发送消息失败，请检查网络连接后重试。如果问题持续，请点击「转人工客服」。',
      created_at: new Date().toISOString()
    })
    showToast('发送失败', 'error')
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

async function markResolved() {
  showActions.value = false
  showRating.value = true
}

async function submitRating(star: number) {
  if (!sessionId.value) return
  rating.value = star
  try {
    await resolveChatSession(sessionId.value, star)
    showRating.value = false
    sessionResolved.value = true
    showToast('感谢您的反馈！', 'success')
  } catch {
    showToast('提交失败', 'error')
  }
}

async function transferToHuman() {
  if (!sessionId.value || isLoading.value || isTransferring.value || sessionTransferred.value) return
  let summary: string | undefined
  if (!messages.value.some(message => message.role === 'user' && message.content.trim())) {
    try {
      const result = await ElMessageBox.prompt('请描述要处理的问题，或需要咨询的套餐。', '联系人工支持', {
        inputType: 'textarea', inputValue: inputMessage.value, confirmButtonText: '继续', cancelButtonText: '取消',
        inputValidator: value => Boolean(value?.trim() && value.trim().length <= 2000) || '请输入 1–2000 字的问题描述',
      })
      summary = result.value.trim()
    } catch { return }
  }
  if (!await confirmAction({
    title: '转接人工支持？',
    message: '系统会把当前问题整理成待处理工单，方便工作人员继续跟进。',
    confirmText: '创建工单',
  })) return
  isTransferring.value = true
  try {
    await transferChatToHuman(sessionId.value, summary ? { summary } : {})
    if (summary) {
      messages.value.push({ id: nextMsgId++, role: 'user', content: summary, created_at: new Date().toISOString() })
      inputMessage.value = ''
    }
    showActions.value = false
    sessionTransferred.value = true
    messages.value.push({
      id: nextMsgId++,
      role: 'system',
      content: '已创建人工支持工单。工作人员可在后台查看问题并回复，请保留此页面或通过帮助中心联系支持。',
      created_at: new Date().toISOString()
    })
    scrollToBottom()
    showToast('已转人工客服', 'success')
  } catch (error) {
    showToast(error instanceof Error && error.message.trim() ? error.message : '转接失败，请稍后重试', 'error')
  } finally {
    isTransferring.value = false
  }
}

async function loadHistory() {
  try {
    const res = chatHistorySchema.parse(await getChatHistory(1, 20))
    historySessions.value = res.items
  } catch {
    showToast('加载历史失败', 'error')
  }
}

async function loadSession(sid: string) {
  try {
    const res = chatSessionDetailSchema.parse(await getChatSession(sid))
    sessionId.value = sid
    messages.value = (res.messages || []).map(message => ({ ...message, id: nextMsgId++ }))
    sessionResolved.value = res.status === 'resolved'
    sessionTransferred.value = res.status === 'transferred'
    showActions.value = res.status === 'active' && messages.value.some(m => m.role === 'ai')
    showHistory.value = false
    scrollToBottom()
  } catch {
    showToast('加载会话失败', 'error')
  }
}

onMounted(async () => {
  loadHistory()
  const started = await startNewSession()
  if (!started) return
  const purchase = sessionStorage.getItem('toolbox_purchase_inquiry')
  if (purchase) {
    sessionStorage.removeItem('toolbox_purchase_inquiry')
    inputMessage.value = purchase.slice(0, 2000)
    // Leave the request editable; entering the page is not consent to submit it.
    return
  }
  try {
    const context = parseJsonRecord(localStorage.getItem('toolbox_support_context'))
    if (context) {
      localStorage.removeItem('toolbox_support_context')
      const problemCode = typeof context.problem_code === 'string' ? context.problem_code : ''
      const toolName = typeof context.tool_name === 'string' ? context.tool_name : '工具'
      const problem = problemCode ? `，问题编号 ${problemCode}` : ''
      inputMessage.value = `${toolName}本次操作未完成${problem}，请帮我处理。`
      await sendMessage()
    }
  } catch {
    localStorage.removeItem('toolbox_support_context')
  }
})
  return {
    sessionId, messages, inputMessage, isLoading, isTransferring, showActions, showRating, rating,
    sessionResolved, sessionTransferred, lastAiMessage, messagesContainer, showHistory,
    historySessions, quickQuestions, formatTime, getStatusText, askQuickQuestion,
    sendMessage, markResolved, transferToHuman, submitRating, loadSession,
  }
}
