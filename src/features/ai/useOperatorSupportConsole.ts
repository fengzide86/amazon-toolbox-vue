import { ref, onMounted } from 'vue'
import { getAIChatConfig, updateAIChatConfig, getAdminChatSessions, getAdminChatSession, getAIChatStats, debugAIChat } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'
import {
  aiConfigSchema,
  aiDebugResultSchema,
  aiStatsSchema,
  chatHistorySchema,
  chatSessionDetailSchema,
  chatSessionSummarySchema,
  errorMessage,
  type AiDebugResult,
  type ChatSessionDetail,
  type ChatSessionSummary,
  type SandboxMessage,
} from '@/features/ai/model'
import { formatChatTime as formatTime, supportSessionStatusLabel as getStatusText } from './presentation'
import { failedDataState, settledDataState, type AsyncDataState } from '@/features/async/state'


export function useOperatorSupportConsole() {
interface TransferRules {
  refund_direct_transfer: boolean
  complaint_direct_transfer: boolean
  auto_transfer_after_retries: boolean
  account_direct_transfer: boolean
}

const platformStore = usePlatformStore()

// 配置
const config = ref({
  welcome_message: '',
  suggested_questions: '[]',
  transfer_rules: '{}',
  ai_model: 'qwen-turbo',
  reply_style: 'concise'
})
const suggestedQuestions = ref([''])
const transferRules = ref({
  refund_direct_transfer: true,
  complaint_direct_transfer: true,
  auto_transfer_after_retries: true,
  account_direct_transfer: false
})
const saving = ref(false)
const loadState = ref<AsyncDataState>('loading')
const loadError = ref('')
const hasLoaded = ref(false)

// 对话记录
const sessions = ref<ChatSessionSummary[]>([])
const sessionFilter = ref('')
const currentPage = ref(1)
const pageSize = 20
const totalSessions = ref(0)
const showDetail = ref(false)
const currentSession = ref<ChatSessionDetail | null>(null)

// 统计
const stats = ref(aiStatsSchema.parse({}))

// 沙盒测试
const testMessage = ref('')
const sandboxMessages = ref<SandboxMessage[]>([])
const sendingTest = ref(false)
const lastDebug = ref<AiDebugResult | null>(null)
const debugPlatform = ref(platformStore.adminPlatform === 'all' ? 'amazon' : platformStore.adminPlatform)

function getStatusTagType(status?: string | null): 'primary' | 'success' | 'warning' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'warning'> = { active: 'primary', resolved: 'success', transferred: 'warning' }
  return status ? map[status] ?? 'info' : 'info'
}

async function loadConfig() {
  const res = aiConfigSchema.parse(await getAIChatConfig())
  config.value = res
  try {
    const parsed: unknown = JSON.parse(res.suggested_questions || '[]')
    suggestedQuestions.value = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : ['']
  } catch {
    suggestedQuestions.value = ['']
  }
  try {
    const parsed: unknown = JSON.parse(res.transfer_rules || '{}')
    if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid transfer rules')
    transferRules.value = { ...transferRules.value, ...parsed as Partial<TransferRules> }
  } catch {
    transferRules.value = {
      refund_direct_transfer: true,
      complaint_direct_transfer: true,
      auto_transfer_after_retries: true,
      account_direct_transfer: false
    }
  }
}

async function saveConfig() {
  saving.value = true
  try {
    await updateAIChatConfig({
      welcome_message: config.value.welcome_message,
      suggested_questions: suggestedQuestions.value.filter(q => q.trim()),
      transfer_rules: transferRules.value,
      ai_model: config.value.ai_model,
      reply_style: config.value.reply_style
    })
    showToast('配置已保存', 'success')
  } catch {
    showToast('保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function loadSessions() {
  const res = chatHistorySchema.parse(await getAdminChatSessions({
    status: sessionFilter.value || undefined,
    page: currentPage.value,
    page_size: pageSize
  }))
  sessions.value = res.items
  totalSessions.value = res.total
}

async function viewSession(rawSession: unknown) {
  const session = chatSessionSummarySchema.parse(rawSession)
  try {
    const res = chatSessionDetailSchema.parse(await getAdminChatSession(session.session_id))
    currentSession.value = { ...session, ...res }
    showDetail.value = true
  } catch {
    showToast('加载会话详情失败', 'error')
  }
}

async function loadStats() {
  stats.value = aiStatsSchema.parse(await getAIChatStats())
}

async function loadAll() {
  loadState.value = hasLoaded.value ? (sessions.value.length ? 'data' : 'empty') : 'loading'
  loadError.value = ''
  try {
    await Promise.all([loadConfig(), loadSessions(), loadStats()])
    hasLoaded.value = true
    loadState.value = settledDataState(sessions.value.length)
  } catch (error) {
    loadError.value = errorMessage(error, '客服规则、对话与统计暂时无法加载')
    loadState.value = failedDataState(hasLoaded.value)
  }
}

// 沙盒测试发送
async function sendTest() {
  if (!testMessage.value.trim()) return
  
  const userMsg: SandboxMessage = {
    role: 'user',
    content: testMessage.value.trim(),
    time: new Date().toISOString()
  }
  sandboxMessages.value.push(userMsg)
  testMessage.value = ''
  sendingTest.value = true
  
  try {
    const result = aiDebugResultSchema.parse(await debugAIChat({
      message: userMsg.content,
      platform_key: debugPlatform.value,
      top_k: 5,
      min_score: 0.3,
    }))
    lastDebug.value = result
    sandboxMessages.value.push({
      role: 'ai',
      content: result.reply,
      refs: result.knowledge_refs || [],
      time: new Date().toISOString()
    })
  } catch (error) {
    showToast(errorMessage(error, '调试失败'), 'error')
  } finally {
    sendingTest.value = false
  }
}

onMounted(loadAll)
  return {
    config, suggestedQuestions, transferRules, saving, sessions, currentSession, stats,
    testMessage, sandboxMessages, sendingTest, lastDebug, debugPlatform,
    loadState, loadError, loadAll,
    getStatusTagType, getStatusText, formatTime, saveConfig, viewSession, sendTest,
  }
}
