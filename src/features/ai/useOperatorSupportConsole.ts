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
const platformStore = usePlatformStore()

// 配置
const config = ref(aiConfigSchema.parse({}))
const suggestedQuestions = ref([''])
const transferKeywords = ref<string[]>([])
const saving = ref(false)
const configState = ref<AsyncDataState>('loading')
const configError = ref('')
const configHasLoaded = ref(false)

// 对话记录
const sessions = ref<ChatSessionSummary[]>([])
const sessionFilter = ref('')
const currentPage = ref(1)
const pageSize = 20
const totalSessions = ref(0)
const showDetail = ref(false)
const currentSession = ref<ChatSessionDetail | null>(null)
const sessionsState = ref<AsyncDataState>('loading')
const sessionsError = ref('')
const sessionsHaveLoaded = ref(false)

// 统计
const stats = ref(aiStatsSchema.parse({}))
const statsState = ref<AsyncDataState>('loading')
const statsError = ref('')
const statsHaveLoaded = ref(false)

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
  configState.value = configHasLoaded.value ? 'data' : 'loading'
  configError.value = ''
  try {
    const res = aiConfigSchema.parse(await getAIChatConfig())
    config.value = res
    suggestedQuestions.value = parseStringList(res.suggested_questions, [''])
    transferKeywords.value = parseStringList(res.transfer_keywords, [])
    configHasLoaded.value = true
    configState.value = 'data'
  } catch (error) {
    configError.value = errorMessage(error, '客服规则配置暂时无法加载')
    configState.value = failedDataState(configHasLoaded.value)
  }
}

function parseStringList(raw: string, fallback: string[]): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : fallback
  } catch {
    return fallback
  }
}

async function saveConfig() {
  saving.value = true
  try {
    await updateAIChatConfig({
      welcome_message: config.value.welcome_message,
      suggested_questions: suggestedQuestions.value.filter(q => q.trim()),
      transfer_keywords: transferKeywords.value.map(keyword => keyword.trim()).filter(Boolean),
      max_unmatched: config.value.max_unmatched,
    })
    showToast('配置已保存', 'success')
  } catch {
    showToast('保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function loadSessions() {
  sessionsState.value = sessionsHaveLoaded.value ? settledDataState(sessions.value.length) : 'loading'
  sessionsError.value = ''
  try {
    const res = chatHistorySchema.parse(await getAdminChatSessions({
      status: sessionFilter.value || undefined,
      page: currentPage.value,
      page_size: pageSize
    }))
    sessions.value = res.items
    totalSessions.value = res.total
    sessionsHaveLoaded.value = true
    sessionsState.value = settledDataState(res.items.length)
  } catch (error) {
    sessionsError.value = errorMessage(error, '最近对话暂时无法加载')
    sessionsState.value = failedDataState(sessionsHaveLoaded.value)
  }
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
  statsState.value = statsHaveLoaded.value ? 'data' : 'loading'
  statsError.value = ''
  try {
    stats.value = aiStatsSchema.parse(await getAIChatStats())
    statsHaveLoaded.value = true
    statsState.value = 'data'
  } catch (error) {
    statsError.value = errorMessage(error, '客服统计暂时无法加载')
    statsState.value = failedDataState(statsHaveLoaded.value)
  }
}

async function loadAll() {
  await Promise.allSettled([loadConfig(), loadSessions(), loadStats()])
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
    config, suggestedQuestions, transferKeywords, saving, sessions, currentSession, stats,
    testMessage, sandboxMessages, sendingTest, lastDebug, debugPlatform,
    configState, configError, sessionsState, sessionsError, statsState, statsError,
    loadAll, loadConfig, loadSessions, loadStats,
    getStatusTagType, getStatusText, formatTime, saveConfig, viewSession, sendTest,
  }
}
