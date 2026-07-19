import { computed, markRaw, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  AUTOMATION_EVENT,
  RUN_STATUS,
  automationEventSchema,
  createAutomationAdapter,
  isTerminalStatus,
  type AutomationAdapter,
  type AutomationAdapterOptions,
  type AutomationError,
  type AutomationStep,
  type AutomationTool,
  type RunStatus,
  type UserAction,
} from '@/automation'

const STATUS_TEXT: Record<RunStatus, string> = {
  idle: '未开始',
  preparing: '准备中',
  running: '执行中',
  waiting_user: '需要操作',
  paused: '已暂停',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
}

function normalizeError(error: unknown): AutomationError {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : 'RUNNER_START_FAILED'
    return { code, message: error.message || '自动处理启动失败' }
  }
  return { code: 'RUNNER_START_FAILED', message: '自动处理启动失败' }
}

export const useTaskRunStore = defineStore('taskRun', () => {
  const runId = ref<string | null>(null)
  const tool = ref<AutomationTool | null>(null)
  const status = ref<RunStatus>(RUN_STATUS.IDLE)
  const steps = ref<AutomationStep[]>([])
  const currentStepId = ref<string | null>(null)
  const browserUrl = ref('')
  const elapsedSeconds = ref(0)
  const result = ref<Record<string, unknown> | null>(null)
  const error = ref<AutomationError | null>(null)
  const artifacts = ref<unknown[]>([])
  const userAction = ref<UserAction | null>(null)

  let adapter: AutomationAdapter | null = null
  let unsubscribe: (() => void) | null = null
  let clockTimer: ReturnType<typeof setInterval> | null = null

  const completedCount = computed(() => steps.value.filter(step => step.status === 'done').length)
  const progressPercent = computed(() => steps.value.length
    ? Math.round((completedCount.value / steps.value.length) * 100)
    : 0)
  const currentStep = computed<AutomationStep | null>(() =>
    steps.value.find(step => step.id === currentStepId.value) || steps.value.at(-1) || null)
  const formattedElapsed = computed(() => {
    const minutes = Math.floor(elapsedSeconds.value / 60).toString().padStart(2, '0')
    const seconds = (elapsedSeconds.value % 60).toString().padStart(2, '0')
    return `${minutes}:${seconds}`
  })
  const statusText = computed(() => STATUS_TEXT[status.value])

  function startClock(): void {
    stopClock()
    clockTimer = setInterval(() => {
      if (status.value === RUN_STATUS.RUNNING) elapsedSeconds.value += 1
    }, 1000)
  }

  function stopClock(): void {
    if (clockTimer) clearInterval(clockTimer)
    clockTimer = null
  }

  function updateStep(stepId: string | null | undefined, patch: Partial<AutomationStep>): void {
    if (!stepId) return
    const index = steps.value.findIndex(step => step.id === stepId)
    const current = steps.value[index]
    if (index === -1 || !current) return
    steps.value[index] = { ...current, ...patch }
  }

  function applyEvent(input: unknown): void {
    const parsed = automationEventSchema.safeParse(input)
    if (!parsed.success) return
    const event = parsed.data
    if (event.type !== AUTOMATION_EVENT.RUN_STARTED && runId.value && event.runId && event.runId !== runId.value) return

    switch (event.type) {
      case AUTOMATION_EVENT.RUN_STARTED:
        runId.value = event.runId || null
        tool.value = event.tool || tool.value
        status.value = RUN_STATUS.RUNNING
        steps.value = (event.steps || []).map(step => ({ ...step, status: 'pending', startedAt: null, completedAt: null }))
        elapsedSeconds.value = 0
        result.value = null
        error.value = null
        artifacts.value = []
        userAction.value = null
        startClock()
        break
      case AUTOMATION_EVENT.BROWSER_NAVIGATED:
        browserUrl.value = event.url || ''
        break
      case AUTOMATION_EVENT.STEP_STARTED:
        if (!event.step) break
        currentStepId.value = event.step.id
        updateStep(event.step.id, { status: 'active', startedAt: event.timestamp })
        break
      case AUTOMATION_EVENT.STEP_COMPLETED:
        updateStep(event.stepId, { status: 'done', completedAt: event.timestamp })
        break
      case AUTOMATION_EVENT.STEP_RETRYING:
        updateStep(event.stepId, { status: 'active', retryCount: event.retryCount || 1 })
        break
      case AUTOMATION_EVENT.RUN_PAUSED:
        status.value = RUN_STATUS.PAUSED
        updateStep(currentStepId.value, { status: 'paused' })
        break
      case AUTOMATION_EVENT.RUN_RESUMED:
        status.value = RUN_STATUS.RUNNING
        updateStep(currentStepId.value, { status: 'active' })
        break
      case AUTOMATION_EVENT.USER_ACTION_REQUIRED:
        status.value = RUN_STATUS.WAITING_USER
        userAction.value = event.action || { title: '需要你完成一步', instruction: event.message || '' }
        updateStep(currentStepId.value, { status: 'paused' })
        break
      case AUTOMATION_EVENT.USER_ACTION_COMPLETED:
        status.value = RUN_STATUS.RUNNING
        userAction.value = null
        updateStep(currentStepId.value, { status: 'active' })
        break
      case AUTOMATION_EVENT.RUN_COMPLETED:
        status.value = RUN_STATUS.COMPLETED
        result.value = event.result || {}
        currentStepId.value = null
        stopClock()
        break
      case AUTOMATION_EVENT.RUN_FAILED:
        status.value = RUN_STATUS.FAILED
        error.value = event.error || { message: '任务执行失败' }
        updateStep(event.stepId || currentStepId.value, { status: 'failed' })
        stopClock()
        break
      case AUTOMATION_EVENT.RUN_CANCELLED:
        status.value = RUN_STATUS.CANCELLED
        updateStep(currentStepId.value, { status: 'cancelled' })
        stopClock()
        break
      case AUTOMATION_EVENT.ARTIFACT_CREATED:
        if (event.artifact !== undefined) artifacts.value.push(event.artifact)
        break
    }
  }

  function disposeAdapter(): void {
    unsubscribe?.()
    unsubscribe = null
    adapter?.dispose()
    adapter = null
  }

  async function start(
    nextTool: AutomationTool,
    options: Omit<AutomationAdapterOptions, 'mode'> & { mode?: AutomationAdapterOptions['mode'] } = {},
  ): Promise<unknown> {
    disposeAdapter()
    stopClock()
    runId.value = null
    status.value = RUN_STATUS.PREPARING
    tool.value = { ...nextTool }
    browserUrl.value = nextTool.targetUrl || ''
    steps.value = []
    currentStepId.value = null
    elapsedSeconds.value = 0
    result.value = null
    error.value = null
    artifacts.value = []
    userAction.value = null
    const mode = options.mode || (nextTool.executionMode === 'live' ? 'live' : 'demo')
    adapter = markRaw(options.adapter || createAutomationAdapter({ ...options, mode }))
    unsubscribe = adapter.subscribe(applyEvent)
    try {
      return await adapter.start(nextTool)
    } catch (startError) {
      status.value = RUN_STATUS.FAILED
      error.value = normalizeError(startError)
      stopClock()
      throw startError
    }
  }

  function pause(): void { void adapter?.pause() }
  function resume(): void { void adapter?.resume() }
  function cancel(): void { void adapter?.cancel() }
  function completeUserAction(): unknown { return adapter?.completeUserAction() }
  function restart(): Promise<unknown> | undefined { return tool.value ? start(tool.value) : undefined }

  function reset(): void {
    if (!isTerminalStatus(status.value)) void adapter?.cancel()
    disposeAdapter()
    stopClock()
    runId.value = null
    tool.value = null
    status.value = RUN_STATUS.IDLE
    steps.value = []
    currentStepId.value = null
    browserUrl.value = ''
    elapsedSeconds.value = 0
    result.value = null
    error.value = null
    artifacts.value = []
    userAction.value = null
  }

  return {
    runId, tool, status, steps, currentStepId, browserUrl, elapsedSeconds, result, error, artifacts, userAction,
    completedCount, progressPercent, currentStep, formattedElapsed, statusText,
    start, pause, resume, cancel, completeUserAction, restart, reset, applyEvent,
  }
})
