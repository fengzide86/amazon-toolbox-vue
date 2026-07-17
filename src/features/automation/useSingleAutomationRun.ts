import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useTaskRunStore } from '@/stores/taskRun'
import { createLog } from '@/utils/api'
import { createToolLaunchGrant } from '@/utils/api/tools'
import { showToast } from '@/utils'
import { confirmAction } from '@/shared/ui/confirm'
import { z } from 'zod'
import type { RunStatus } from '@/automation'


export function useSingleAutomationRun() {
interface EmbeddedWebviewElement extends HTMLElement {
  getWebContentsId(): number
}

const launchGrantSchema = z.object({
  token: z.string(),
  target_url: z.string().optional(),
  expires_at: z.string().optional(),
  script_key: z.string().optional(),
  runner_api_version: z.coerce.number().optional(),
  tool_version: z.string().optional(),
  tool_manifest: z.unknown().optional(),
  tool_signature: z.string().optional(),
  signing_key_id: z.string().optional(),
  signature_required: z.boolean().optional(),
}).passthrough()

const launchGrantResponseSchema = z.object({
  launch_data: launchGrantSchema.optional(),
  grant: launchGrantSchema.optional(),
  expires_at: z.string().optional(),
  expires_in: z.coerce.number().optional(),
}).passthrough()

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const router = useRouter()
const appStore = useAppStore()
const taskRunStore = useTaskRunStore()
const {
  status: runStatus,
  currentStep,
  browserUrl,
  userAction,
} = storeToRefs(taskRunStore)

const webviewRef = ref<EmbeddedWebviewElement | null>(null)
const browserLoading = ref(true)
const restarting = ref(false)
const taskStarted = ref(false)
const taskStarting = ref(false)
const loggedRunIds = new Set<string>()
let browserReadyFallback: ReturnType<typeof setTimeout> | null = null

const stageItems = [
  { key: 'prepare', label: '准备', description: '正在打开并检查目标页面' },
  { key: 'process', label: '执行', description: '系统正在自动完成操作' },
  { key: 'verify', label: '核验', description: '正在确认页面反馈和结果' },
  { key: 'complete', label: '完成', description: '结束本次自动操作' },
]

const toolName = computed(() => appStore.currentTool?.name || '自动化工具')
const toolUrl = computed(() => appStore.toolUrl || 'https://sellercentral.amazon.com')
const isElectron = computed(() => Boolean(window.electronAPI))
const platformName = computed(() => appStore.currentTool?.platformKey === 'aliexpress' ? '速卖通' : '亚马逊')
const platformShortName = computed(() => platformName.value === '速卖通' ? 'AliExpress' : 'amazon seller')
const isActiveRun = computed(() => ['idle', 'preparing', 'running', 'waiting_user', 'paused'].includes(runStatus.value))
const isTerminal = computed(() => ['completed', 'failed', 'cancelled'].includes(runStatus.value))
const interactionLocked = computed(() => ['preparing', 'running', 'paused'].includes(runStatus.value))
const displayUrl = computed(() => {
  const value = browserUrl.value || toolUrl.value
  try {
    const parsed = new URL(value)
    return parsed.host + parsed.pathname
  } catch {
    return value
  }
})

const currentStageIndex = computed(() => {
  if (runStatus.value === 'completed') return 3
  const stepId = currentStep.value?.id
  if (stepId === 'execute') return 1
  if (stepId && ['verify', 'summary'].includes(stepId)) return 2
  return 0
})

const runningMessage = computed(() => {
  if (runStatus.value === 'preparing' || runStatus.value === 'idle') return '正在准备自动操作'
  if (runStatus.value === 'paused') return '自动操作已暂停'
  if (currentStageIndex.value === 2) return '正在检查处理结果'
  return '正在自动处理'
})
const customerStatusText = computed(() => ({
  idle: '正在准备',
  preparing: '正在准备',
  running: '正在自动处理',
  waiting_user: '需要你的操作',
  paused: '已暂停',
  completed: '处理完成',
  failed: '本次未完成',
  cancelled: '已停止',
}[runStatus.value] || '正在处理'))
const problemCode = computed(() => {
  const source = taskRunStore.runId || taskRunStore.error?.code || 'UNKNOWN'
  return String(source).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase() || 'UNKNOWN'
})

function stageState(index: number) {
  if (runStatus.value === 'completed') return 'done'
  if (index < currentStageIndex.value) return 'done'
  if (index === currentStageIndex.value) return 'active'
  return 'pending'
}

async function completeUserAction() {
  try {
    await taskRunStore.completeUserAction()
  } catch {
    showToast('暂时无法继续，请重试', 'error')
  }
}

async function stopRun() {
  if (!await confirmAction({
    title: '停止本次处理？',
    message: '停止后可以返回工具箱重新发起。',
    confirmText: '停止处理',
    cancelText: '继续运行',
    danger: true,
  })) return
  await taskRunStore.cancel()
}

async function closeWorkspace() {
  if (isActiveRun.value && !await confirmAction({
    title: '退出执行工作区？',
    message: '当前自动处理尚未完成，退出后本次运行会停止。',
    confirmText: '退出并停止',
    cancelText: '留在这里',
    danger: true,
  })) return
  if (isActiveRun.value) await taskRunStore.cancel()
  taskRunStore.reset()
  await window.electronAPI?.automation?.unregisterBrowser?.()
  appStore.closeTool()
}

async function restartRun() {
  if (restarting.value) return
  restarting.value = true
  try {
    if (!window.electronAPI?.automation) {
      await taskRunStore.restart()
      return
    }
    const currentTool = appStore.currentTool
    if (!currentTool?.id) throw new Error('当前工具信息不完整')
    const response = launchGrantResponseSchema.parse(await createToolLaunchGrant(currentTool.id, {
      platformKey: currentTool.platformKey,
      deviceId: localStorage.getItem('toolbox_device_id') || '',
    }))
    const grant = response?.launch_data || response?.grant
    if (!grant?.token) throw new Error('工具启动数据不完整')
    const nextTool = {
      ...currentTool,
      targetUrl: grant.target_url || currentTool.targetUrl || toolUrl.value,
      launchGrant: {
        token: grant.token,
        expiresAt: grant.expires_at || response.expires_at,
        expiresIn: response.expires_in,
        scriptKey: grant.script_key,
        runnerApiVersion: grant.runner_api_version || 1,
        toolVersion: grant.tool_version || '1.0.0',
        toolManifest: grant.tool_manifest,
        toolSignature: grant.tool_signature,
        signingKeyId: grant.signing_key_id,
        signatureRequired: Boolean(grant.signature_required),
      },
    }
    appStore.currentTool = nextTool
    appStore.toolUrl = nextTool.targetUrl
    await taskRunStore.start(nextTool)
  } catch (error) {
    showToast(errorMessage(error, '暂时无法重新执行'), 'error')
  } finally {
    restarting.value = false
  }
}

async function openSupport() {
  localStorage.setItem('toolbox_support_context', JSON.stringify({
    run_id: taskRunStore.runId,
    tool_id: appStore.currentTool?.id,
    tool_name: toolName.value,
    platform_key: appStore.currentTool?.platformKey,
    error_code: taskRunStore.error?.code,
    problem_code: problemCode.value,
  }))
  await closeWorkspace()
  if (!appStore.toolVisible) router.push('/user/ai-chat')
}

async function startTaskWithBrowser() {
  if (taskStarted.value || taskStarting.value) return
  taskStarting.value = true
  const webview = webviewRef.value
  if (isElectron.value && webview?.getWebContentsId && window.electronAPI?.automation?.registerBrowser) {
    try {
      await window.electronAPI.automation.registerBrowser(webview.getWebContentsId())
    } catch (error) {
      console.warn('[ToolWorkspace] 嵌入浏览器注册失败，将使用独立浏览器:', errorMessage(error, '未知错误'))
    }
  }
  taskStarted.value = true
  if (browserReadyFallback) clearTimeout(browserReadyFallback)
  try {
    await taskRunStore.start({ ...(appStore.currentTool || {}), targetUrl: toolUrl.value })
  } catch {
    showToast('自动处理启动失败，你可以重新执行或联系客服', 'error')
  } finally {
    taskStarting.value = false
  }
}

function bindWebviewEvents() {
  const webview = webviewRef.value
  if (!webview?.addEventListener) {
    browserLoading.value = false
    startTaskWithBrowser()
    return
  }
  webview.addEventListener('did-start-loading', () => { browserLoading.value = true })
  webview.addEventListener('did-stop-loading', () => { browserLoading.value = false })
  webview.addEventListener('did-fail-load', () => { browserLoading.value = false })
  webview.addEventListener('dom-ready', startTaskWithBrowser, { once: true })
  try {
    if (webview.getWebContentsId?.()) startTaskWithBrowser()
  } catch {
    // webContents id is unavailable until the first DOM-ready event on some Electron versions.
  }
}

async function recordTerminalRun(status: RunStatus) {
  const runId = taskRunStore.runId
  if (!runId || loggedRunIds.has(runId) || !['completed', 'failed', 'cancelled'].includes(status)) return
  loggedRunIds.add(runId)
  const tool = taskRunStore.tool || appStore.currentTool || {}
  const toolRecord = tool as Record<string, unknown>
  const launchGrant = typeof toolRecord.launchGrant === 'object' && toolRecord.launchGrant !== null
    ? toolRecord.launchGrant as Record<string, unknown>
    : null
  try {
    await createLog({
      device_id: localStorage.getItem('toolbox_device_id') || null,
      tool_name: tool.name,
      module: typeof toolRecord.module === 'string' ? toolRecord.module : undefined,
      status: status === 'completed' ? 'success' : status,
      error_code: status === 'failed' ? (taskRunStore.error?.code || 'AUTOMATION_FAILED') : null,
      detail: JSON.stringify({
        run_id: runId,
        tool_id: tool.id,
        platform_key: tool.platformKey,
        script_key: typeof launchGrant?.scriptKey === 'string' ? launchGrant.scriptKey : undefined,
        elapsed_seconds: taskRunStore.elapsedSeconds,
      }),
    })
  } catch (error) {
    console.warn('[TaskRun] 运行日志上报失败:', errorMessage(error, '未知错误'))
  }
}

onMounted(() => {
  if (!isElectron.value) {
    browserLoading.value = false
    startTaskWithBrowser()
    return
  }
  nextTick(bindWebviewEvents)
  browserReadyFallback = setTimeout(startTaskWithBrowser, 6000)
})

watch(runStatus, recordTerminalRun)

onUnmounted(() => {
  if (browserReadyFallback) clearTimeout(browserReadyFallback)
  window.electronAPI?.automation?.unregisterBrowser?.()
  taskRunStore.reset()
})
  return {
    webviewRef, browserLoading, restarting, stageItems, toolName, toolUrl, isElectron,
    platformName, platformShortName, isActiveRun, isTerminal, interactionLocked, displayUrl,
    currentStageIndex, runningMessage, customerStatusText, problemCode, runStatus, userAction,
    stageState, completeUserAction, stopRun, closeWorkspace, restartRun, openSupport,
  }
}
