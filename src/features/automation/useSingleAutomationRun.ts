import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useTaskRunStore } from '@/stores/taskRun'
import { cancelDemoRun, createDemoRun, finishDemoRun, updateDemoRun } from '@/utils/api'
import { showToast } from '@/utils'
import { confirmAction } from '@/shared/ui/confirm'
import type { RunStatus } from '@/automation'
import { demoRunSchema, unwrapApiData } from '@/features/demo/model'
import { demoActivityToken, setDemoActivity } from '@/utils/demoActivity'
import { refreshLiveLaunch } from '@/features/automation/launch'
import type { FreightQuoteResult } from '@/shared/freight/types'


export function useSingleAutomationRun() {
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const router = useRouter()
const appStore = useAppStore()
const taskRunStore = useTaskRunStore()
 const {
   status: runStatus,
   currentStep,
   userAction,
   result: runResult,
 } = storeToRefs(taskRunStore)

 const browserLoading = ref(true)
const restarting = ref(false)
const taskStarted = ref(false)
const taskStarting = ref(false)
 const browserRegistered = ref(false)
 const loggedRunIds = new Set<string>()
 const telemetryRuns = new Map<string, Promise<string | null>>()
 let activeDemoToken: string | null = null

 const toolName = computed(() => appStore.currentTool?.name || '自动化工具')
 const isDemo = computed(() => appStore.currentTool?.executionMode !== 'live')
const stageItems = computed(() => isDemo.value ? [
  { key: 'prepare', label: '沙盒准备', description: '正在启动本地交互页面和执行器' },
  { key: 'process', label: '真实操作', description: '执行器正在模拟页面中填写和点击' },
  { key: 'verify', label: '结果核验', description: '核对模拟平台返回的成功状态' },
  { key: 'complete', label: '演示完成', description: '保存本次交互演示结果' },
] : [
  { key: 'prepare', label: '执行准备', description: '校验授权、适配器和本地浏览器' },
  { key: 'process', label: '自动处理', description: '在比赛模拟平台中执行已发布的业务步骤' },
  { key: 'verify', label: '结果核验', description: '读取平台状态并确认业务结果' },
  { key: 'complete', label: '处理完成', description: '保存记录、截图和扫描指纹' },
])
const platformName = computed(() => appStore.currentTool?.platformKey === 'aliexpress' ? '速卖通' : '亚马逊')
const platformShortName = computed(() => platformName.value === '速卖通' ? 'AliExpress' : 'amazon seller')
const freightQuote = computed(() => (runResult.value?.freightQuote || null) as FreightQuoteResult | null)
const adapterVersion = computed(() => String(runResult.value?.adapterVersion || appStore.currentTool?.launchGrant?.toolVersion || '1.0.0'))
const evidenceSummary = computed(() => ({
  fingerprint: String(runResult.value?.pageFingerprint || '').slice(0, 12),
  screenshot: Boolean(runResult.value?.screenshot),
  signatureVerified: runResult.value?.signatureVerified === true,
}))
const isActiveRun = computed(() => ['idle', 'preparing', 'running', 'waiting_user', 'paused'].includes(runStatus.value))
const isTerminal = computed(() => ['completed', 'failed', 'cancelled'].includes(runStatus.value))
 const isBrowserRetryableError = computed(() => false)
 const isDesktop = computed(() => Boolean(window.electronAPI?.automation))
 const interactionLocked = computed(() => ['preparing', 'running', 'paused'].includes(runStatus.value))
 const displayUrl = computed(() => isDemo.value
   ? '本地交互沙盒 · 不访问外部平台'
   : taskRunStore.browserUrl || appStore.currentTool?.targetUrl || '比赛模拟平台')

const currentStageIndex = computed(() => {
  if (runStatus.value === 'completed') return 3
  const stepId = currentStep.value?.id
  if (stepId === 'execute') return 1
  if (stepId && ['verify', 'summary'].includes(stepId)) return 2
  return 0
})

 const runningMessage = computed(() => {
   if (runStatus.value === 'preparing' || runStatus.value === 'idle') return isDemo.value ? '正在准备交互沙盒' : '正在准备本地执行器'
   if (runStatus.value === 'paused') return isDemo.value ? '交互演示已暂停' : '自动处理已暂停'
   if (currentStageIndex.value === 2) return '正在核验页面结果'
   return isDemo.value ? '正在操作本地模拟页面' : '自动处理进行中'
 })
 const customerStatusText = computed(() => {
   const demo: Record<string, string> = { idle: '沙盒准备中', preparing: '沙盒准备中', running: '交互演示中', waiting_user: '需要手动操作', paused: '演示已暂停', completed: '演示完成', failed: '演示异常', cancelled: '已退出演示' }
   const live: Record<string, string> = { idle: '等待执行', preparing: '执行准备中', running: '自动处理中', waiting_user: '需要你操作', paused: '已暂停', completed: '执行成功', failed: '执行失败', cancelled: '已停止' }
   return (isDemo.value ? demo : live)[runStatus.value] || '处理中'
 })
const problemCode = computed(() => {
  const source = taskRunStore.runId || taskRunStore.error?.code || 'UNKNOWN'
  return String(source).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase() || 'UNKNOWN'
})
 const failureTitle = computed(() => isDemo.value ? '交互演示异常' : '自动执行失败')
 const failureDescription = computed(() => {
   const stepId = currentStep.value?.id
   if (stepId === 'prepare') return '模拟场景在准备阶段停止，可重新加载演示。'
   if (stepId === 'open') return '模拟页面没有正常载入，演示已安全停止。'
   if (stepId === 'inspect') return '模拟页面检查未完成，演示已安全停止。'
   if (stepId === 'verify' || stepId === 'summary') return '结果说明未能完整展示，可重新加载演示。'
   if (isDemo.value) return '本地交互沙盒已停止，不影响任何外部平台数据。'
   return taskRunStore.error?.message || '执行器已安全停止，可查看问题详情后重新发起。'
 })
const technicalError = computed(() => {
  const code = taskRunStore.error?.code || 'AUTOMATION_FAILED'
  const message = taskRunStore.error?.message || '未提供更多信息'
  return `${code} · ${message}`
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
    title: isDemo.value ? '退出交互演示？' : '停止当前自动处理？',
    message: isDemo.value ? '当前演示尚未完成，退出后本地沙盒会停止。' : '退出后会安全停止浏览器操作并保留问题记录。',
    confirmText: isDemo.value ? '退出演示' : '停止处理',
    cancelText: '留在这里',
    danger: true,
  })) return
  if (isActiveRun.value) await taskRunStore.cancel()
  await deactivateDemoActivity()
  taskRunStore.reset()
  appStore.closeTool()
}

async function restartRun() {
  if (restarting.value) return
  restarting.value = true
  try {
    const currentTool = appStore.currentTool
    if (!currentTool?.id) throw new Error('当前工具信息不完整')
    const nextTool = currentTool.executionMode === 'live'
      ? await refreshLiveLaunch(currentTool)
      : { ...currentTool, demoRunId: createLocalDemoRunId(), executionMode: 'demo' as const }
    appStore.currentTool = nextTool
    if (nextTool.executionMode !== 'live') await activateDemoActivity(nextTool.demoRunId || 'workspace')
    await taskRunStore.start(nextTool, { mode: nextTool.executionMode || 'demo' })
    if (nextTool.executionMode !== 'live') scheduleTelemetry(nextTool)
  } catch (error) {
    await deactivateDemoActivity()
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

 async function startDemoTask() {
   if (taskStarted.value || taskStarting.value) return
   taskStarting.value = true
   taskStarted.value = true
   try {
     const currentTool = appStore.currentTool
     const demoRunId = currentTool?.demoRunId || createLocalDemoRunId()
     const nextTool = currentTool?.executionMode === 'live'
       ? currentTool
       : { ...(currentTool || {}), demoRunId, executionMode: 'demo' as const }
     appStore.currentTool = nextTool
     if (nextTool.executionMode !== 'live') await activateDemoActivity(demoRunId)
     await taskRunStore.start(nextTool, { mode: nextTool.executionMode || 'demo' })
     if (nextTool.executionMode !== 'live') scheduleTelemetry(nextTool)
   } catch {
     await deactivateDemoActivity()
     showToast('演示启动失败，你可以重新加载或联系客服', 'error')
   } finally {
     taskStarting.value = false
     browserLoading.value = false
   }
 }

 async function registerWorkspaceBrowser(event: Event): Promise<void> {
   if (browserRegistered.value) return
   const webview = event.currentTarget as HTMLElement & { getWebContentsId?: () => number }
   const webContentsId = webview.getWebContentsId?.()
   if (typeof webContentsId !== 'number') {
     browserLoading.value = false
     showToast('应用内浏览器尚未就绪，请重新打开工具', 'error')
     return
   }
   try {
     await window.electronAPI?.automation?.registerBrowser(webContentsId)
     browserRegistered.value = true
     await startDemoTask()
   } catch (error) {
     browserLoading.value = false
     showToast(errorMessage(error, '应用内浏览器启动失败'), 'error')
   }
 }

 async function recordTerminalRun(status: RunStatus) {
   if (!['completed', 'failed', 'cancelled'].includes(status)) return
   if (!isDemo.value) return
   const runId = taskRunStore.runId
   if (!runId || loggedRunIds.has(runId)) {
     await deactivateDemoActivity()
     return
   }
   loggedRunIds.add(runId)
   try {
    const remoteRunId = await telemetryRuns.get(runId)
    if (!remoteRunId) return
    if (status === 'completed') {
      await finishDemoRun(remoteRunId, { event_seq: 2, completed_step_count: taskRunStore.completedCount })
    } else if (status === 'cancelled') {
      await cancelDemoRun(remoteRunId, 2)
    } else {
      await updateDemoRun(remoteRunId, {
        event_seq: 2,
        status: 'error',
        current_step_id: taskRunStore.currentStep?.id || null,
        completed_step_count: taskRunStore.completedCount,
        error_code: taskRunStore.error?.code || 'DEMO_RUNTIME_ERROR',
      })
    }
   } catch (error) {
     console.warn('[DemoRun] 演示记录上报失败:', errorMessage(error, '未知错误'))
   } finally {
     await deactivateDemoActivity()
   }
 }

 function scheduleTelemetry(tool: NonNullable<typeof appStore.currentTool>): void {
   const localRunId = tool.demoRunId
   if (!localRunId || telemetryRuns.has(localRunId)) return
   const request = (async (): Promise<string | null> => {
     try {
       const created = demoRunSchema.parse(unwrapApiData(await createDemoRun({
         client_demo_run_id: localRunId,
         tool_id: String(tool.id),
         tool_name: tool.name || '工具演示',
         platform_key: tool.platformKey || 'amazon',
         scenario_id: tool.scenarioId || 'default',
         total_step_count: 6,
       })))
       const remoteRunId = String(created.id)
       await updateDemoRun(remoteRunId, {
         event_seq: 1,
         status: 'running',
         current_step_id: 'prepare',
         completed_step_count: 0,
       })
       return remoteRunId
     } catch (error) {
       console.warn('[DemoRun] 演示记录后台同步失败，本地演示继续:', errorMessage(error, '未知错误'))
       return null
     }
   })()
   telemetryRuns.set(localRunId, request)
 }

 async function activateDemoActivity(id: string | number): Promise<void> {
   const nextToken = demoActivityToken('single', id)
   if (activeDemoToken === nextToken) return
   await deactivateDemoActivity()
   activeDemoToken = nextToken
   await setDemoActivity(nextToken, true)
 }

 async function deactivateDemoActivity(): Promise<void> {
   const token = activeDemoToken
   activeDemoToken = null
   if (token) await setDemoActivity(token, false)
 }

onMounted(() => {
  if (!isDesktop.value) void startDemoTask()
})

watch(runStatus, recordTerminalRun)
watch(runStatus, status => {
  if (status === 'failed' || status === 'cancelled' || status === 'completed') {
    browserLoading.value = false
  }
})

onUnmounted(() => {
  void deactivateDemoActivity()
  if (browserRegistered.value) void window.electronAPI?.automation?.unregisterBrowser()
  taskRunStore.reset()
})
  return {
    browserLoading, restarting, stageItems, toolName, isDemo, isDesktop,
    platformName, platformShortName, isActiveRun, isTerminal, interactionLocked, displayUrl,
    freightQuote, adapterVersion, evidenceSummary,
    currentStageIndex, runningMessage, customerStatusText, problemCode, runStatus, userAction,
    isBrowserRetryableError, failureTitle, failureDescription, technicalError,
    stageState, completeUserAction, stopRun, closeWorkspace, restartRun, openSupport, registerWorkspaceBrowser,
  }
}

function cryptoRandom(): string {
  if (globalThis.crypto?.getRandomValues) {
    return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2)), value => value.toString(16)).join('')
  }
  return Math.random().toString(16).slice(2)
}

function createLocalDemoRunId(): string {
  return `demo_run_local_${Date.now()}_${cryptoRandom()}`
}
