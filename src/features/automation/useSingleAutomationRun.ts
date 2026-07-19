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
 } = storeToRefs(taskRunStore)

 const browserLoading = ref(true)
const restarting = ref(false)
const taskStarted = ref(false)
const taskStarting = ref(false)
 const loggedRunIds = new Set<string>()
 let activeDemoToken: string | null = null

const stageItems = [
  { key: 'prepare', label: '演示准备', description: '正在准备模拟页面和演示场景' },
  { key: 'process', label: '演示步骤', description: '展示工具计划执行的操作流程' },
  { key: 'verify', label: '结果说明', description: '展示模拟结果及需要关注的信息' },
  { key: 'complete', label: '演示完成', description: '结束本次模拟流程' },
]

 const toolName = computed(() => appStore.currentTool?.name || '自动化工具')
 const isDemo = computed(() => true)
const platformName = computed(() => appStore.currentTool?.platformKey === 'aliexpress' ? '速卖通' : '亚马逊')
const platformShortName = computed(() => platformName.value === '速卖通' ? 'AliExpress' : 'amazon seller')
const isActiveRun = computed(() => ['idle', 'preparing', 'running', 'waiting_user', 'paused'].includes(runStatus.value))
const isTerminal = computed(() => ['completed', 'failed', 'cancelled'].includes(runStatus.value))
 const isBrowserRetryableError = computed(() => false)
 const interactionLocked = computed(() => ['preparing', 'running', 'paused'].includes(runStatus.value))
 const displayUrl = computed(() => '演示流程 · 不访问真实平台')

const currentStageIndex = computed(() => {
  if (runStatus.value === 'completed') return 3
  const stepId = currentStep.value?.id
  if (stepId === 'execute') return 1
  if (stepId && ['verify', 'summary'].includes(stepId)) return 2
  return 0
})

 const runningMessage = computed(() => {
   if (runStatus.value === 'preparing' || runStatus.value === 'idle') return '正在准备演示流程'
   if (runStatus.value === 'paused') return '演示已暂停'
   if (currentStageIndex.value === 2) return '正在展示结果说明'
   return '演示进行中'
 })
 const customerStatusText = computed(() => ({
   idle: '演示准备中',
   preparing: '演示准备中',
   running: '演示进行中',
   waiting_user: '模拟人工步骤',
   paused: '演示已暂停',
   completed: '演示完成',
   failed: '演示异常',
   cancelled: '已退出演示',
 }[runStatus.value] || '演示进行中'))
const problemCode = computed(() => {
  const source = taskRunStore.runId || taskRunStore.error?.code || 'UNKNOWN'
  return String(source).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase() || 'UNKNOWN'
})
 const failureTitle = computed(() => '演示加载异常')
 const failureDescription = computed(() => {
   const stepId = currentStep.value?.id
   if (stepId === 'prepare') return '模拟场景在准备阶段停止，可重新加载演示。'
   if (stepId === 'open') return '模拟页面没有正常载入，演示已安全停止。'
   if (stepId === 'inspect') return '模拟页面检查未完成，演示已安全停止。'
   if (stepId === 'verify' || stepId === 'summary') return '结果说明未能完整展示，可重新加载演示。'
   return '模拟流程已经停止，不影响任何真实平台数据。'
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
    title: '退出演示工作区？',
    message: '当前演示尚未完成，退出后本次播放会停止。',
    confirmText: '退出演示',
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
    const clientDemoRunId = `demo_run_${Date.now()}_${cryptoRandom()}`
    const created = demoRunSchema.parse(unwrapApiData(await createDemoRun({
      client_demo_run_id: clientDemoRunId,
      tool_id: String(currentTool.id),
      tool_name: currentTool.name || '工具演示',
      platform_key: currentTool.platformKey || 'amazon',
      scenario_id: currentTool.scenarioId || 'default',
      total_step_count: 6,
    })))
    await updateDemoRun(String(created.id), {
      event_seq: 1,
      status: 'running',
      current_step_id: 'prepare',
      completed_step_count: 0,
    })
    const nextTool = { ...currentTool, demoRunId: String(created.id), executionMode: 'demo' as const }
    appStore.currentTool = nextTool
    await activateDemoActivity(created.id)
    await taskRunStore.start(nextTool, { mode: 'demo' })
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
     await activateDemoActivity(appStore.currentTool?.demoRunId || taskRunStore.runId || 'workspace')
     await taskRunStore.start({ ...(appStore.currentTool || {}), executionMode: 'demo' }, { mode: 'demo' })
   } catch {
     await deactivateDemoActivity()
     showToast('演示启动失败，你可以重新加载或联系客服', 'error')
   } finally {
     taskStarting.value = false
     browserLoading.value = false
   }
 }

 async function recordTerminalRun(status: RunStatus) {
   if (!['completed', 'failed', 'cancelled'].includes(status)) return
   const runId = taskRunStore.runId
   if (!runId || loggedRunIds.has(runId)) {
     await deactivateDemoActivity()
     return
   }
   loggedRunIds.add(runId)
   try {
    if (status === 'completed') {
      await finishDemoRun(runId, { event_seq: 2, completed_step_count: taskRunStore.completedCount })
    } else if (status === 'cancelled') {
      await cancelDemoRun(runId, 2)
    } else {
      await updateDemoRun(runId, {
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
  void startDemoTask()
})

watch(runStatus, recordTerminalRun)
watch(runStatus, status => {
  if (status === 'failed' || status === 'cancelled' || status === 'completed') {
    browserLoading.value = false
  }
})

onUnmounted(() => {
  void deactivateDemoActivity()
  taskRunStore.reset()
})
  return {
    browserLoading, restarting, stageItems, toolName, isDemo,
    platformName, platformShortName, isActiveRun, isTerminal, interactionLocked, displayUrl,
    currentStageIndex, runningMessage, customerStatusText, problemCode, runStatus, userAction,
    isBrowserRetryableError, failureTitle, failureDescription, technicalError,
    stageState, completeUserAction, stopRun, closeWorkspace, restartRun, openSupport,
  }
}

function cryptoRandom(): string {
  if (globalThis.crypto?.getRandomValues) {
    return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2)), value => value.toString(16)).join('')
  }
  return Math.random().toString(16).slice(2)
}
